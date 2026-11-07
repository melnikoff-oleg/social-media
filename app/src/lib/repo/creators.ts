import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { creators, users } from "@/lib/db/schema";
import { isUniqueViolation } from "./scope";

/** Instagram handle rule, applied after trimming, dropping a leading "@" and lowercasing. */
export const USERNAME_PATTERN = /^[a-z0-9._]{1,30}$/;
export const CATEGORY_MAX = 200;
/** Creators one account may hold (each one costs Apify calls on refresh and runs). */
export const MAX_CREATORS_PER_ACCOUNT = 50;

const usernameSchema = z
  .string()
  .transform((s) => s.trim().replace(/^@+/, "").toLowerCase())
  .pipe(z.string().regex(USERNAME_PATTERN));

export const creatorInputSchema = z.object({
  username: usernameSchema,
  category: z.string().max(CATEGORY_MAX).nullish(),
  profilePicUrl: z.string().nullish(),
  followers: z.number().int().nullish(),
  reelsCount30d: z.number().int().nullish(),
  avgViews30d: z.number().int().nullish(),
  lastScrapedAt: z.date().nullish(),
});
export const creatorPatchSchema = creatorInputSchema.partial();

export type CreatorInput = z.input<typeof creatorInputSchema>;
export type CreatorPatch = z.input<typeof creatorPatchSchema>;
export type CreatorRow = typeof creators.$inferSelect;

export async function listCreators(userId: string, category?: string): Promise<CreatorRow[]> {
  const where =
    category !== undefined
      ? and(eq(creators.userId, userId), eq(creators.category, category))
      : eq(creators.userId, userId);
  return db.select().from(creators).where(where).orderBy(creators.username);
}

export async function getCreator(userId: string, id: string): Promise<CreatorRow | undefined> {
  const [row] = await db
    .select()
    .from(creators)
    .where(and(eq(creators.userId, userId), eq(creators.id, id)))
    .limit(1);
  return row;
}

/**
 * Creates a creator, refusing once the account already holds MAX_CREATORS_PER_ACCOUNT.
 * The count and the insert run in one transaction with the owner's row locked, so two
 * concurrent creates cannot both slip past the limit.
 */
export async function createCreator(
  userId: string,
  input: CreatorInput
): Promise<CreatorRow | { error: "duplicate" } | { error: "limit" }> {
  const data = creatorInputSchema.parse(input);
  try {
    return await db.transaction(async (tx) => {
      await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("no key update");
      const [{ n }] = await tx
        .select({ n: count() })
        .from(creators)
        .where(eq(creators.userId, userId));
      if (Number(n) >= MAX_CREATORS_PER_ACCOUNT) return { error: "limit" as const };
      const [row] = await tx.insert(creators).values({ ...data, userId }).returning();
      return row;
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "duplicate" };
    throw err;
  }
}

export async function updateCreator(
  userId: string,
  id: string,
  patch: CreatorPatch
): Promise<CreatorRow | undefined | { error: "duplicate" }> {
  const data = Object.fromEntries(
    Object.entries(creatorPatchSchema.parse(patch)).filter(([, v]) => v !== undefined)
  );
  if (Object.keys(data).length === 0) return getCreator(userId, id);
  try {
    const [row] = await db
      .update(creators)
      .set(data)
      .where(and(eq(creators.userId, userId), eq(creators.id, id)))
      .returning();
    return row;
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "duplicate" };
    throw err;
  }
}

export async function deleteCreator(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(creators)
    .where(and(eq(creators.userId, userId), eq(creators.id, id)))
    .returning({ id: creators.id });
  return rows.length > 0;
}
