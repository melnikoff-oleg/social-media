import {
  authorize,
  auditIfAdmin,
  duplicate,
  invalidBody,
  invalidId,
  jsonError,
  notFound,
  parseId,
  readJson,
  withErrors,
} from "@/lib/api/route-helpers";
import {
  createCreator,
  creatorInputSchema,
  deleteCreator,
  listCreators,
  MAX_CREATORS_PER_ACCOUNT,
  updateCreator,
} from "@/lib/repo/creators";
import { scrapeCreatorStats } from "@/lib/apify";
import { toCreator } from "@/lib/api/serializers";
import type { z } from "zod";

// Clients may only set the handle and the category; stats come from scraping.
const creatorBodySchema = creatorInputSchema.pick({ username: true, category: true });
const creatorUpdateSchema = creatorBodySchema.partial();

/** 400 with "usuário inválido" when the handle is what failed, the generic 400 otherwise. */
function badBody(error: z.ZodError): Response {
  return error.issues.some((i) => i.path[0] === "username")
    ? jsonError("usuário inválido", 400)
    : invalidBody();
}

export const GET = withErrors(async (request) => {
  const scope = await authorize(request);
  if ("response" in scope) return scope.response;
  const category = new URL(request.url).searchParams.get("category") || undefined;
  const rows = await listCreators(scope.userId, category);
  return Response.json(rows.map(toCreator));
});

export const POST = withErrors(async (request) => {
  const scope = await authorize(request);
  if ("response" in scope) return scope.response;
  const parsed = creatorBodySchema.safeParse(await readJson(request));
  if (!parsed.success) return badBody(parsed.error);
  const created = await createCreator(scope.userId, parsed.data);
  if ("error" in created) {
    return created.error === "limit"
      ? jsonError(`Limite de ${MAX_CREATORS_PER_ACCOUNT} criadores por conta atingido`, 422)
      : duplicate();
  }
  await auditIfAdmin(scope, "create", { resource: "creator", id: created.id });

  // Saved already; enrich with stats when the scraper answers, otherwise return as is.
  try {
    const stats = await scrapeCreatorStats(created.username);
    const updated = await updateCreator(scope.userId, created.id, {
      profilePicUrl: stats.profilePicUrl,
      followers: stats.followers,
      reelsCount30d: stats.reelsCount30d,
      avgViews30d: stats.avgViews30d,
      lastScrapedAt: new Date(),
    });
    if (updated && !("error" in updated)) {
      return Response.json(toCreator(updated), { status: 201 });
    }
  } catch (err) {
    console.error(`Failed to scrape stats for @${created.username}:`, err);
  }
  return Response.json(toCreator(created), { status: 201 });
});

export const PUT = withErrors(async (request) => {
  const scope = await authorize(request);
  if ("response" in scope) return scope.response;
  const body = await readJson(request);
  if (typeof body !== "object" || body === null) return invalidBody();
  const id = parseId((body as { id?: unknown }).id);
  if (!id) return invalidId();
  const parsed = creatorUpdateSchema.safeParse(body);
  if (!parsed.success) return badBody(parsed.error);
  const result = await updateCreator(scope.userId, id, parsed.data);
  if (result === undefined) return notFound();
  if ("error" in result) return duplicate();
  await auditIfAdmin(scope, "update", { resource: "creator", id });
  return Response.json(toCreator(result));
});

export const DELETE = withErrors(async (request) => {
  const scope = await authorize(request);
  if ("response" in scope) return scope.response;
  const id = parseId(new URL(request.url).searchParams.get("id"));
  if (!id) return invalidId();
  if (!(await deleteCreator(scope.userId, id))) return notFound();
  await auditIfAdmin(scope, "delete", { resource: "creator", id });
  return Response.json({ success: true });
});
