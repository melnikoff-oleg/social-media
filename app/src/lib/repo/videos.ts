import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { videos } from "@/lib/db/schema";

export type VideoRow = typeof videos.$inferSelect;
export type VideoFilter = { configName?: string; creator?: string };

export async function listVideos(userId: string, filter: VideoFilter = {}): Promise<VideoRow[]> {
  const conds = [eq(videos.userId, userId)];
  if (filter.configName !== undefined) conds.push(eq(videos.configName, filter.configName));
  if (filter.creator !== undefined) conds.push(eq(videos.creatorUsername, filter.creator));
  return db
    .select()
    .from(videos)
    .where(and(...conds))
    .orderBy(desc(videos.dateAdded));
}

export async function setVideoStarred(
  userId: string,
  id: string,
  starred: boolean
): Promise<VideoRow | undefined> {
  const [row] = await db
    .update(videos)
    .set({ starred })
    .where(and(eq(videos.userId, userId), eq(videos.id, id)))
    .returning();
  return row;
}
