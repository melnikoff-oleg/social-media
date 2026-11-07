import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { pipelineRuns, users } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/require-session";
import { invalidId, jsonError, parseId, withErrors } from "@/lib/api/route-helpers";

const RUNS_LIMIT = 50;

/**
 * Read-only list of an account's latest pipeline runs, for the admin panel.
 * Never returns `log`: it can hold raw upstream errors.
 */
export const GET = withErrors(async (request) => {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;

  const userId = parseId(new URL(request.url).searchParams.get("userId"));
  if (!userId) return invalidId();

  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!owner) return jsonError("usuário não encontrado", 404);

  const rows = await db
    .select({
      id: pipelineRuns.id,
      status: pipelineRuns.status,
      startedAt: pipelineRuns.startedAt,
      finishedAt: pipelineRuns.finishedAt,
      params: pipelineRuns.params,
    })
    .from(pipelineRuns)
    .where(eq(pipelineRuns.userId, userId))
    .orderBy(desc(pipelineRuns.startedAt))
    .limit(RUNS_LIMIT);

  return Response.json(
    rows.map((r) => ({
      id: r.id,
      status: r.status,
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
      params: r.params ?? null,
    }))
  );
});
