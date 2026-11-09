import { z } from "zod";
import { requireSession } from "@/lib/auth/require-session";
import { invalidBody, jsonError, readJson, withErrors } from "@/lib/api/route-helpers";
import { getUsageToday, reserveRun } from "@/lib/quota/quota";
import { executeRun, finishRun, startRun } from "@/lib/pipeline/runs";
import type { PipelineEvent } from "@/lib/pipeline";
import { CONCEPT_PROVIDERS, DEFAULT_CONCEPT_PROVIDER } from "@/lib/types";

export const maxDuration = 300;

// Same bounds as the Run page inputs; also keeps quota arithmetic far from int overflow.
const paramsSchema = z.object({
  configName: z.string().trim().min(1),
  maxVideos: z.number().int().min(1).max(100),
  topK: z.number().int().min(1).max(10),
  nDays: z.number().int().min(1).max(365),
  provider: z.enum(CONCEPT_PROVIDERS).default(DEFAULT_CONCEPT_PROVIDER),
});

/**
 * Starts a pipeline run for the signed-in user and streams its progress as SSE.
 * 409 `busy` when the user already has a run in progress; 429 `runs_exhausted` /
 * `videos_exhausted` when today's quota is used up. The run lives on the server:
 * closing the tab stops the stream, not the run.
 */
export const POST = withErrors(async (request) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  const user = session.user;

  const parsed = paramsSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    if (parsed.error.issues.some((i) => i.path[0] === "provider")) {
      return jsonError("Modelo de conceitos inválido", 400);
    }
    return invalidBody();
  }
  // Always includes `provider`, so the run's stored params record which model was used.
  const params = parsed.data;

  if (user.role !== "admin") {
    const usage = await getUsageToday(user.id);
    if (usage.videos >= user.dailyVideosLimit) return jsonError("videos_exhausted", 429);
  }

  const started = await startRun(user.id, params);
  if ("error" in started) return jsonError("busy", 409);
  const { runId } = started;

  let reservation: Awaited<ReturnType<typeof reserveRun>>;
  try {
    reservation = await reserveRun(user);
  } catch (err) {
    await finishRun(runId, "failed", ["run reservation failed"]);
    throw err;
  }
  if (!reservation.ok) {
    await finishRun(runId, "failed", ["runs_exhausted"]);
    return jsonError("runs_exhausted", 429);
  }

  const encoder = new TextEncoder();
  let open = true;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: PipelineEvent | Record<string, unknown>) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          open = false;
        }
      };

      // Not awaited: the run continues even if the client disconnects.
      void executeRun(runId, params, send, { userId: user.id, user })
        .catch((err) => {
          console.error(`[pipeline] run ${runId} failed:`, err);
          send({
            status: "error",
            phase: "done",
            activeTasks: [],
            creatorsCompleted: 0,
            creatorsTotal: 0,
            creatorsScraped: 0,
            videosAnalyzed: 0,
            videosTotal: 0,
            errors: ["Erro interno na execução"],
            log: [],
          });
        })
        .finally(() => {
          if (!open) return;
          open = false;
          try {
            controller.close();
          } catch {
            // already closed
          }
        });
    },
    cancel() {
      open = false;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});
