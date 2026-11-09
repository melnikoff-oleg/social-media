import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { configs, creators, users } from "@/lib/db/schema";

export type StarterCopyResult = { configs: number; creators: number };

/** The starter-content owner: the first user with role 'admin' (by createdAt). */
export async function findStarterOwnerId(): Promise<string | null> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "admin"))
    .orderBy(asc(users.createdAt), asc(users.id))
    .limit(1);
  return row?.id ?? null;
}

/**
 * Copies the owner's configs and creators to a new account, with fresh ids, in
 * a single transaction. Videos, runs, sessions, usage and audit are not copied.
 * With no owner (no admin exists yet) it copies nothing.
 */
export async function copyStarterContent(
  ownerId: string | null | undefined,
  newUserId: string
): Promise<StarterCopyResult> {
  if (!ownerId || ownerId === newUserId) return { configs: 0, creators: 0 };
  return db.transaction(async (tx) => {
    const srcConfigs = await tx.select().from(configs).where(eq(configs.userId, ownerId));
    const srcCreators = await tx.select().from(creators).where(eq(creators.userId, ownerId));

    if (srcConfigs.length > 0) {
      await tx.insert(configs).values(
        srcConfigs.map((c) => ({
          id: randomUUID(),
          userId: newUserId,
          configName: c.configName,
          creatorsCategory: c.creatorsCategory,
          analysisInstruction: c.analysisInstruction,
          newConceptsInstruction: c.newConceptsInstruction,
        }))
      );
    }
    if (srcCreators.length > 0) {
      await tx.insert(creators).values(
        srcCreators.map((c) => ({
          id: randomUUID(),
          userId: newUserId,
          username: c.username,
          category: c.category,
          profilePicUrl: c.profilePicUrl,
          followers: c.followers,
          reelsCount30d: c.reelsCount30d,
          avgViews30d: c.avgViews30d,
          lastScrapedAt: c.lastScrapedAt,
        }))
      );
    }
    return { configs: srcConfigs.length, creators: srcCreators.length };
  });
}
