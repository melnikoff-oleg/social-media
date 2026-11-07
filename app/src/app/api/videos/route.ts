import { z } from "zod";
import {
  authorize,
  auditIfAdmin,
  invalidBody,
  invalidId,
  notFound,
  parseId,
  readJson,
  withErrors,
} from "@/lib/api/route-helpers";
import { listVideos, setVideoStarred } from "@/lib/repo/videos";
import { toVideo } from "@/lib/api/serializers";

const starredSchema = z.object({ starred: z.boolean() });

export const GET = withErrors(async (request) => {
  const scope = await authorize(request);
  if ("response" in scope) return scope.response;
  const { searchParams } = new URL(request.url);
  const rows = await listVideos(scope.userId, {
    configName: searchParams.get("configName") || undefined,
    creator: searchParams.get("creator") || undefined,
  });
  const list = rows.map(toVideo);
  // Newest day first, then most viewed (the order the UI has always shown).
  list.sort((a, b) => b.dateAdded.localeCompare(a.dateAdded) || b.views - a.views);
  return Response.json(list);
});

export const PATCH = withErrors(async (request) => {
  const scope = await authorize(request);
  if ("response" in scope) return scope.response;
  const body = await readJson(request);
  if (typeof body !== "object" || body === null) return invalidBody();
  const id = parseId((body as { id?: unknown }).id);
  if (!id) return invalidId();
  const parsed = starredSchema.safeParse(body);
  if (!parsed.success) return invalidBody();
  const row = await setVideoStarred(scope.userId, id, parsed.data.starred);
  if (!row) return notFound();
  await auditIfAdmin(scope, "update", { resource: "video", id, starred: parsed.data.starred });
  return Response.json(toVideo(row));
});
