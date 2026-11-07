import { z } from "zod";
import {
  authorize,
  auditIfAdmin,
  idSchema,
  invalidBody,
  invalidId,
  readJson,
  withErrors,
} from "@/lib/api/route-helpers";
import { listCreators, updateCreator } from "@/lib/repo/creators";
import { scrapeCreatorStats } from "@/lib/apify";

export const maxDuration = 300;

const SCRAPE_FAILED = "Não foi possível buscar os dados do perfil";
const INTERNAL_ERROR = "Erro interno";
const CREATOR_GONE = "Criador não encontrado";

/** A creator scraped less than this long ago is skipped (no Apify call). */
const REFRESH_COOLDOWN_MS = 10 * 60 * 1000;
const SKIPPED_RECENT = "Atualizado há menos de 10 minutos";

function scrapedRecently(lastScrapedAt: Date | null, now: number): boolean {
  return lastScrapedAt !== null && now - lastScrapedAt.getTime() < REFRESH_COOLDOWN_MS;
}

const refreshBodySchema = z.object({ ids: z.array(z.unknown()).optional() });

export const POST = withErrors(async (request) => {
  const scope = await authorize(request);
  if ("response" in scope) return scope.response;

  const parsed = refreshBodySchema.safeParse(await readJson(request));
  if (!parsed.success) return invalidBody();
  const ids = z.array(idSchema).safeParse(parsed.data.ids ?? []);
  if (!ids.success) return invalidId();

  // Only the target account's creators are ever considered; foreign ids are simply absent.
  const owned = await listCreators(scope.userId);
  const wanted = new Set(ids.data.map((id) => id.toLowerCase()));
  const toRefresh = wanted.size > 0 ? owned.filter((c) => wanted.has(c.id.toLowerCase())) : owned;

  const now = Date.now();
  const toScrape = toRefresh.filter((c) => !scrapedRecently(c.lastScrapedAt, now));

  if (toScrape.length > 0) {
    await auditIfAdmin(scope, "update", {
      resource: "creator",
      action: "refresh",
      ids: toScrape.map((c) => c.id),
    });
  }

  const encoder = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController, data: unknown) =>
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

  const stream = new ReadableStream({
    async start(controller) {
      for (const creator of toRefresh) {
        if (scrapedRecently(creator.lastScrapedAt, now)) {
          send(controller, {
            type: "progress",
            username: creator.username,
            status: "skipped",
            reason: SKIPPED_RECENT,
          });
          continue;
        }
        // Client-visible messages are fixed; the raw error stays in the server log.
        let message = SCRAPE_FAILED;
        try {
          send(controller, { type: "progress", username: creator.username, status: "scraping" });
          const stats = await scrapeCreatorStats(creator.username);
          message = INTERNAL_ERROR;
          const updated = await updateCreator(scope.userId, creator.id, {
            profilePicUrl: stats.profilePicUrl,
            followers: stats.followers,
            reelsCount30d: stats.reelsCount30d,
            avgViews30d: stats.avgViews30d,
            lastScrapedAt: new Date(),
          });
          if (!updated || "error" in updated) {
            console.error(`Refresh of @${creator.username}: creator could not be updated`, updated);
            send(controller, { type: "error", username: creator.username, error: CREATOR_GONE });
            continue;
          }
          send(controller, { type: "progress", username: creator.username, status: "done", stats });
        } catch (err) {
          console.error(`Failed to refresh @${creator.username}:`, err);
          send(controller, { type: "error", username: creator.username, error: message });
        }
      }
      send(controller, { type: "complete" });
      controller.close();
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
