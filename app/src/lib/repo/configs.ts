import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { configs } from "@/lib/db/schema";
import { isUniqueViolation } from "./scope";

/** Upper bounds for free-text fields (names/categories and the two prompts). */
export const NAME_MAX = 200;
export const INSTRUCTION_MAX = 20000;

export const configInputSchema = z.object({
  configName: z.string().trim().min(1).max(NAME_MAX),
  creatorsCategory: z.string().max(NAME_MAX).nullish(),
  analysisInstruction: z.string().max(INSTRUCTION_MAX).nullish(),
  newConceptsInstruction: z.string().max(INSTRUCTION_MAX).nullish(),
});
export const configPatchSchema = configInputSchema.partial();

export type ConfigInput = z.infer<typeof configInputSchema>;
export type ConfigPatch = z.infer<typeof configPatchSchema>;
export type ConfigRow = typeof configs.$inferSelect;

export async function listConfigs(userId: string): Promise<ConfigRow[]> {
  return db.select().from(configs).where(eq(configs.userId, userId)).orderBy(configs.configName);
}

export async function getConfig(userId: string, id: string): Promise<ConfigRow | undefined> {
  const [row] = await db
    .select()
    .from(configs)
    .where(and(eq(configs.userId, userId), eq(configs.id, id)))
    .limit(1);
  return row;
}

export async function createConfig(
  userId: string,
  input: ConfigInput
): Promise<ConfigRow | { error: "duplicate" }> {
  const data = configInputSchema.parse(input);
  try {
    const [row] = await db.insert(configs).values({ ...data, userId }).returning();
    return row;
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "duplicate" };
    throw err;
  }
}

export async function updateConfig(
  userId: string,
  id: string,
  patch: ConfigPatch
): Promise<ConfigRow | undefined | { error: "duplicate" }> {
  const data = Object.fromEntries(
    Object.entries(configPatchSchema.parse(patch)).filter(([, v]) => v !== undefined)
  );
  if (Object.keys(data).length === 0) return getConfig(userId, id);
  try {
    const [row] = await db
      .update(configs)
      .set(data)
      .where(and(eq(configs.userId, userId), eq(configs.id, id)))
      .returning();
    return row;
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "duplicate" };
    throw err;
  }
}

export async function deleteConfig(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(configs)
    .where(and(eq(configs.userId, userId), eq(configs.id, id)))
    .returning({ id: configs.id });
  return rows.length > 0;
}
