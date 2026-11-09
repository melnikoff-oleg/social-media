import { v4 as uuid } from "uuid";
import { db } from "@/lib/db";
import { videos } from "@/lib/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import { getConfig, listConfigs } from "@/lib/repo/configs";
import { getCreator, listCreators } from "@/lib/repo/creators";
import { reserveVideos } from "@/lib/quota/quota";
import { scrapeReels, type ApifyReel } from "./apify";
import { uploadVideo, analyzeVideo } from "./gemini";
import { generateNewConcepts as claudeGenerateNewConcepts } from "./claude";
import { generateNewConcepts as deepseekGenerateNewConcepts } from "./deepseek";
import {
  DEFAULT_CONCEPT_PROVIDER,
  type ConceptProvider,
  type PipelineParams,
  type PipelineProgress,
  type ActiveTask,
} from "./types";

const VIDEO_CONCURRENCY = 3;
/** Timeout for downloading one reel from the CDN before it is sent to Gemini. */
const VIDEO_DOWNLOAD_TIMEOUT_MS = 120_000;

/**
 * External services the pipeline talks to. Production uses the Apify, Gemini and
 * Claude clients; tests inject fakes so no real API is called.
 */
export interface PipelineDeps {
  scrapeReels(username: string, maxVideos: number, nDays: number): Promise<ApifyReel[]>;
  /** Downloads the video and returns the analysis text. `onStep` reports sub-steps. */
  analyzeVideo(
    videoUrl: string,
    analysisInstruction: string,
    onStep: (step: string) => void
  ): Promise<string>;
  /** One concept generator per provider; the run picks one from `params.provider`. */
  conceptGenerators: Record<ConceptProvider, ConceptGenerator>;
}

export type ConceptGenerator = (
  analysis: string,
  newConceptsInstruction: string
) => Promise<string>;

/** Display name used in progress messages. */
const PROVIDER_LABEL: Record<ConceptProvider, string> = {
  claude: "Claude",
  deepseek: "DeepSeek",
};

export const defaultPipelineDeps: PipelineDeps = {
  scrapeReels,
  async analyzeVideo(videoUrl, analysisInstruction, onStep) {
    onStep("Baixando");
    const videoResponse = await fetch(videoUrl, {
      signal: AbortSignal.timeout(VIDEO_DOWNLOAD_TIMEOUT_MS),
    });
    if (!videoResponse.ok) throw new Error(`Falha no download: ${videoResponse.status}`);
    const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
    const contentType = videoResponse.headers.get("content-type") || "video/mp4";

    onStep("Enviando para o Gemini");
    const fileData = await uploadVideo(videoBuffer, contentType);

    onStep("Gemini analisando");
    return analyzeVideo(fileData.uri, fileData.mimeType, analysisInstruction);
  },
  conceptGenerators: {
    claude: claudeGenerateNewConcepts,
    deepseek: deepseekGenerateNewConcepts,
  },
};

/** Whose data the run reads and writes, and whose quota it consumes. */
export type PipelineOwner = { userId: string; user: SessionUser };

/**
 * One SSE event. `limitedTo` is set from the event where the video quota cut the
 * selection short; `videosRemaining` is null when the quota is unlimited (admin).
 */
export type PipelineEvent = PipelineProgress & {
  limitedTo?: number;
  videosRemaining?: number | null;
};

interface ScrapedVideo {
  creatorId: string;
  videoUrl: string;
  postUrl: string;
  views: number;
  likes: number;
  comments: number;
  username: string;
  thumbnail: string;
  postedAt: Date;
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const i = index++;
      await fn(items[i]);
    }
  });
  await Promise.all(workers);
}

function isForeignKeyViolation(err: unknown): boolean {
  let e: unknown = err;
  for (let i = 0; i < 3 && e && typeof e === "object"; i++) {
    if ((e as { code?: unknown }).code === "23503") return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Inserts an analyzed video for `userId`. The creator and config ids are kept only
 * if they still belong to the same user at write time; otherwise they are null.
 */
async function saveVideo(
  userId: string,
  configId: string,
  configName: string,
  video: ScrapedVideo,
  analysis: string,
  newConcepts: string
): Promise<void> {
  const [ownedCreator, ownedConfig] = await Promise.all([
    getCreator(userId, video.creatorId),
    getConfig(userId, configId),
  ]);
  const row = {
    userId,
    creatorId: ownedCreator ? ownedCreator.id : null,
    configId: ownedConfig ? ownedConfig.id : null,
    creatorUsername: video.username,
    configName,
    link: video.postUrl,
    thumbnail: video.thumbnail,
    views: video.views,
    likes: video.likes,
    comments: video.comments,
    analysis,
    newConcepts,
    datePosted: video.postedAt,
  };
  try {
    await db.insert(videos).values(row);
  } catch (err) {
    // The creator or config was deleted between the check and the insert: keep the
    // (already paid for) analysis, dropping only the reference that vanished.
    if (!isForeignKeyViolation(err)) throw err;
    const [creatorNow, configNow] = await Promise.all([
      row.creatorId ? getCreator(userId, row.creatorId) : undefined,
      row.configId ? getConfig(userId, row.configId) : undefined,
    ]);
    await db.insert(videos).values({
      ...row,
      creatorId: creatorNow ? creatorNow.id : null,
      configId: configNow ? configNow.id : null,
    });
  }
}

/** An error whose message is safe to show to the user as is. */
class PipelineUserError extends Error {}

function rawMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * The final client-facing progress plus the server-side log, which also holds the raw
 * error details (SQL, upstream responses) that are never sent to the client.
 */
export type PipelineResult = { final: PipelineEvent; serverLog: string[] };

/**
 * Runs the scrape → rank → analyze → generate flow for one account and returns the
 * final progress. Never throws: failures end with `status: "error"`.
 *
 * Client-visible strings (log, errors) are fixed messages; raw error details go only
 * to `serverLog` and console.error.
 */
export async function runPipeline(
  params: PipelineParams,
  onEvent: (event: PipelineEvent) => void,
  owner: PipelineOwner,
  deps: PipelineDeps = defaultPipelineDeps
): Promise<PipelineResult> {
  const serverLog: string[] = [];
  const provider: ConceptProvider = params.provider ?? DEFAULT_CONCEPT_PROVIDER;
  const generateConcepts = deps.conceptGenerators[provider];
  const providerLabel = PROVIDER_LABEL[provider];
  const progress: PipelineEvent = {
    status: "running",
    phase: "scraping",
    activeTasks: [],
    creatorsCompleted: 0,
    creatorsTotal: 0,
    creatorsScraped: 0,
    videosAnalyzed: 0,
    videosTotal: 0,
    errors: [],
    log: [],
  };

  const snapshot = (): PipelineEvent => ({
    ...progress,
    activeTasks: [...progress.activeTasks],
    log: [...progress.log],
    errors: [...progress.errors],
  });

  // A listener failure (e.g. the client went away) must never stop the run.
  const emit = () => {
    try {
      onEvent(snapshot());
    } catch {
      // ignore
    }
  };

  const log = (msg: string) => {
    const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
    progress.log.push(line);
    serverLog.push(line);
    emit();
  };

  /** Records a failure: a fixed message for the client, the raw detail server-side. */
  const fail = (publicMsg: string, err: unknown) => {
    const detail = rawMessage(err);
    console.error(`[pipeline] ${publicMsg}:`, err);
    serverLog.push(`[${new Date().toISOString()}] ${publicMsg} — ${detail}`);
    progress.errors.push(publicMsg);
    log(`Erro — ${publicMsg}`);
  };

  const addTask = (task: ActiveTask) => {
    progress.activeTasks.push(task);
    emit();
  };

  const updateTask = (id: string, step: string) => {
    const t = progress.activeTasks.find((t) => t.id === id);
    if (t) { t.step = step; emit(); }
  };

  const removeTask = (id: string) => {
    progress.activeTasks = progress.activeTasks.filter((t) => t.id !== id);
    emit();
  };

  try {
    // Load config (only the owner's)
    const config = (await listConfigs(owner.userId)).find(
      (c) => c.configName === params.configName
    );
    if (!config) throw new PipelineUserError("Configuração não encontrada");

    log(`Configuração carregada: ${config.configName}`);

    // Load the owner's creators in the config's category
    const creators = (await listCreators(owner.userId)).filter(
      (c) => c.category === config.creatorsCategory
    );
    if (creators.length === 0) {
      throw new PipelineUserError("Nenhum criador cadastrado na categoria desta configuração");
    }

    progress.creatorsTotal = creators.length;
    log(`${creators.length} criadores encontrados — buscando todos em paralelo`);
    emit();

    // Phase 1: Scrape all creators in parallel
    progress.phase = "scraping";
    const cutoffDate = new Date(Date.now() - params.nDays * 24 * 60 * 60 * 1000);
    let allTopVideos: ScrapedVideo[] = [];

    const scrapeResults = await Promise.allSettled(
      creators.map(async (creator) => {
        const taskId = `scrape-${creator.username}`;
        addTask({ id: taskId, creator: creator.username, step: "Buscando reels" });

        try {
          const reels = await deps.scrapeReels(creator.username, params.maxVideos, params.nDays);
          updateTask(taskId, `${reels.length} reels encontrados`);

          const scraped: ScrapedVideo[] = reels
            .filter((r) => r.videoUrl && r.timestamp)
            .map((r) => ({
              creatorId: creator.id,
              videoUrl: r.videoUrl,
              postUrl: r.url,
              views: r.videoPlayCount || 0,
              likes: r.likesCount || 0,
              comments: r.commentsCount || 0,
              username: r.ownerUsername || creator.username,
              thumbnail: r.images?.[0] || "",
              postedAt: new Date(r.timestamp),
            }))
            .filter((v) => !Number.isNaN(v.postedAt.getTime()) && v.postedAt >= cutoffDate);

          scraped.sort((a, b) => b.views - a.views);
          const topVideos = scraped.slice(0, params.topK);

          updateTask(taskId, `Top ${topVideos.length} selecionados`);
          log(`@${creator.username}: ${reels.length} reels → top ${topVideos.length} selecionados`);
          progress.creatorsScraped++;
          return topVideos;
        } finally {
          removeTask(taskId);
        }
      })
    );

    scrapeResults.forEach((result, i) => {
      if (result.status === "fulfilled") {
        allTopVideos.push(...result.value);
      } else {
        fail(`Falha ao buscar reels de @${creators[i].username}`, result.reason);
      }
      progress.creatorsCompleted++;
    });

    // Reserve today's video quota for exactly what was selected; keep the most viewed
    // videos when the quota grants fewer.
    if (allTopVideos.length > 0) {
      const { granted, remaining } = await reserveVideos(owner.user, allTopVideos.length);
      progress.videosRemaining = Number.isFinite(remaining) ? remaining : null;
      if (granted < allTopVideos.length) {
        allTopVideos.sort((a, b) => b.views - a.views);
        allTopVideos = allTopVideos.slice(0, granted);
        progress.limitedTo = granted;
        log(
          granted === 0
            ? "Limite diário de vídeos esgotado — nada para analisar"
            : `Limite diário de vídeos: analisando apenas os ${granted} mais vistos`
        );
      }
    }

    progress.videosTotal = allTopVideos.length;
    log(`Busca concluída. ${allTopVideos.length} vídeos para analisar (${VIDEO_CONCURRENCY} workers)`);
    emit();

    // Phase 2: Process videos concurrently
    progress.phase = "analyzing";
    emit();

    await runWithConcurrency(allTopVideos, VIDEO_CONCURRENCY, async (video) => {
      const taskId = `video-${uuid().slice(0, 8)}`;
      const label = `${video.views.toLocaleString("pt-BR")} visualizações`;

      let failure = "Falha ao analisar vídeo";
      try {
        addTask({ id: taskId, creator: video.username, step: "Baixando", views: video.views });

        const analysis = await deps.analyzeVideo(
          video.videoUrl,
          config.analysisInstruction ?? "",
          (step) => {
            updateTask(taskId, step);
            if (step !== "Baixando") log(`@${video.username} (${label}): ${step}`);
          }
        );

        updateTask(taskId, `${providerLabel} gerando conceitos`);
        log(`@${video.username} (${label}): ${providerLabel} gerando conceitos`);

        const newConcepts = await generateConcepts(
          analysis,
          config.newConceptsInstruction ?? ""
        );

        failure = "Falha ao salvar vídeo";
        await saveVideo(owner.userId, config.id, config.configName, video, analysis, newConcepts);

        progress.videosAnalyzed++;
        removeTask(taskId);
        log(`@${video.username} (${label}): concluído`);
      } catch (err) {
        removeTask(taskId);
        fail(`${failure} de @${video.username} (${label})`, err);
      }
    });

    progress.phase = "done";
    progress.status = "completed";
    log(`Pipeline concluído! ${progress.videosAnalyzed}/${progress.videosTotal} vídeos analisados, ${progress.errors.length} erros.`);
  } catch (err) {
    progress.status = "error";
    progress.phase = "done";
    fail(err instanceof PipelineUserError ? err.message : "Erro interno na execução", err);
  }
  // Explicit terminal event, independent of the log() calls above.
  emit();
  return { final: snapshot(), serverLog };
}
