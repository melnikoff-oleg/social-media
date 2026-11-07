import type { ConfigRow } from "@/lib/repo/configs";
import type { CreatorRow } from "@/lib/repo/creators";
import type { VideoRow } from "@/lib/repo/videos";
import type { Config, Creator, Video } from "@/lib/types";

// Database rows -> the JSON shapes the UI has always consumed (no nulls, no userId).

/** Formats a timestamp as YYYY-MM-DD (the format the UI has always shown), "" when absent. */
function toDay(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

export function toConfig(row: ConfigRow): Config {
  return {
    id: row.id,
    configName: row.configName,
    creatorsCategory: row.creatorsCategory ?? "",
    analysisInstruction: row.analysisInstruction ?? "",
    newConceptsInstruction: row.newConceptsInstruction ?? "",
  };
}

export function toCreator(row: CreatorRow): Creator {
  return {
    id: row.id,
    username: row.username,
    category: row.category ?? "",
    profilePicUrl: row.profilePicUrl ?? "",
    followers: row.followers ?? 0,
    reelsCount30d: row.reelsCount30d ?? 0,
    avgViews30d: row.avgViews30d ?? 0,
    lastScrapedAt: row.lastScrapedAt ? row.lastScrapedAt.toISOString() : "",
  };
}

export function toVideo(row: VideoRow): Video {
  return {
    id: row.id,
    link: row.link ?? "",
    thumbnail: row.thumbnail ?? "",
    creator: row.creatorUsername ?? "",
    views: row.views ?? 0,
    likes: row.likes ?? 0,
    comments: row.comments ?? 0,
    analysis: row.analysis ?? "",
    newConcepts: row.newConcepts ?? "",
    datePosted: toDay(row.datePosted),
    dateAdded: toDay(row.dateAdded),
    configName: row.configName ?? "",
    starred: row.starred ?? false,
  };
}
