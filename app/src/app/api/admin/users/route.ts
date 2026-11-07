import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { adminAudit, sessions, users } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/require-session";
import { getUsageToday } from "@/lib/quota/quota";
import { invalidBody, jsonError, notFound, readJson, withErrors } from "@/lib/api/route-helpers";

const quota = z.number().int().min(0).max(10000);

const patchSchema = z
  .object({
    id: z.guid(),
    dailyRunsLimit: quota.optional(),
    dailyVideosLimit: quota.optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine(
    (b) => b.dailyRunsLimit !== undefined || b.dailyVideosLimit !== undefined || b.active !== undefined,
    { message: "nada para alterar" }
  );

export const GET = withErrors(async (request) => {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      active: users.active,
      dailyRunsLimit: users.dailyRunsLimit,
      dailyVideosLimit: users.dailyVideosLimit,
    })
    .from(users)
    .orderBy(asc(users.email));

  const list = await Promise.all(
    rows.map(async (u) => {
      const usage = await getUsageToday(u.id);
      return {
        ...u,
        dailyRunsLimit: Number(u.dailyRunsLimit),
        dailyVideosLimit: Number(u.dailyVideosLimit),
        usageToday: { runs: Number(usage.runs), videos: Number(usage.videos) },
      };
    })
  );
  return Response.json(list);
});

export const PATCH = withErrors(async (request) => {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;

  const parsed = patchSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalidBody();
  const { id, dailyRunsLimit, dailyVideosLimit, active } = parsed.data;

  if (id === auth.user.id && active === false) {
    return jsonError("Você não pode desativar a própria conta", 400);
  }

  const result = await db.transaction(async (tx) => {
    const [before] = await tx.select().from(users).where(eq(users.id, id)).for("update").limit(1);
    if (!before) return null;

    const patch: Partial<typeof users.$inferInsert> = {};
    const quotaFrom: Record<string, number> = {};
    const quotaTo: Record<string, number> = {};
    if (dailyRunsLimit !== undefined && dailyRunsLimit !== before.dailyRunsLimit) {
      patch.dailyRunsLimit = dailyRunsLimit;
      quotaFrom.dailyRunsLimit = before.dailyRunsLimit;
      quotaTo.dailyRunsLimit = dailyRunsLimit;
    }
    if (dailyVideosLimit !== undefined && dailyVideosLimit !== before.dailyVideosLimit) {
      patch.dailyVideosLimit = dailyVideosLimit;
      quotaFrom.dailyVideosLimit = before.dailyVideosLimit;
      quotaTo.dailyVideosLimit = dailyVideosLimit;
    }
    const activeChanged = active !== undefined && active !== before.active;
    if (activeChanged) patch.active = active;

    let after = before;
    if (Object.keys(patch).length > 0) {
      [after] = await tx.update(users).set(patch).where(eq(users.id, id)).returning();
    }
    if (Object.keys(quotaTo).length > 0) {
      await tx.insert(adminAudit).values({
        adminId: auth.user.id,
        targetUserId: id,
        action: "quota_update",
        detail: { previous: quotaFrom, new: quotaTo },
      });
    }
    if (activeChanged) {
      await tx.insert(adminAudit).values({
        adminId: auth.user.id,
        targetUserId: id,
        action: "set_active",
        detail: { previous: before.active, new: active },
      });
      // A deactivated account is logged out everywhere, atomically with the change.
      if (active === false) await tx.delete(sessions).where(eq(sessions.userId, id));
    }
    return after;
  });

  if (!result) return notFound();
  return Response.json({
    id: result.id,
    email: result.email,
    name: result.name,
    role: result.role,
    active: result.active,
    dailyRunsLimit: Number(result.dailyRunsLimit),
    dailyVideosLimit: Number(result.dailyVideosLimit),
  });
});
