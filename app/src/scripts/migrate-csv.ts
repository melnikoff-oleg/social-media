import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { parse } from "csv-parse/sync";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { configs, creators, users, videos } from "@/lib/db/schema";
import { normalizeEmail } from "@/lib/auth/normalize";

export type MigrateResult = {
  configs: number;
  creators: number;
  videos: number;
  orphanVideos: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHUNK = 500;

// Same parse options as src/lib/csv.ts. Read-only: this script never writes to dataDir.
function readCsv(dataDir: string, filename: string): Record<string, string>[] {
  const filepath = path.join(dataDir, filename);
  if (!existsSync(filepath)) return [];
  const content = readFileSync(filepath, "utf-8");
  if (!content.trim()) return [];
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true,
  }) as Record<string, string>[];
}

function int(v: string | undefined): number {
  return parseInt(v || "0", 10) || 0;
}

function date(v: string | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function nul(v: string | undefined): string | null {
  return v ? v : null;
}

function requireUuid(id: string | undefined, file: string, line: number): string {
  if (!id || !UUID_RE.test(id)) {
    throw new Error(`invalid id in ${file} (row ${line}): ${JSON.stringify(id ?? "")}`);
  }
  return id;
}

function chunks<T>(rows: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += CHUNK) out.push(rows.slice(i, i + CHUNK));
  return out;
}

export async function migrateCsv(opts: { dataDir: string; ownerEmail: string }): Promise<MigrateResult> {
  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalizeEmail(opts.ownerEmail)))
    .limit(1);
  if (!owner) throw new Error("owner not found");
  const userId = owner.id;

  const configRows = readCsv(opts.dataDir, "configs.csv").map((r, i) => ({
    id: requireUuid(r.id, "configs.csv", i + 2),
    userId,
    configName: r.configName || "",
    creatorsCategory: nul(r.creatorsCategory),
    analysisInstruction: nul(r.analysisInstruction),
    newConceptsInstruction: nul(r.newConceptsInstruction),
  }));
  const creatorRows = readCsv(opts.dataDir, "creators.csv").map((r, i) => ({
    id: requireUuid(r.id, "creators.csv", i + 2),
    userId,
    username: r.username || "",
    category: nul(r.category),
    profilePicUrl: nul(r.profilePicUrl),
    followers: int(r.followers),
    reelsCount30d: int(r.reelsCount30d),
    avgViews30d: int(r.avgViews30d),
    lastScrapedAt: date(r.lastScrapedAt),
  }));
  const rawVideos = readCsv(opts.dataDir, "videos.csv");
  for (const [i, r] of rawVideos.entries()) requireUuid(r.id, "videos.csv", i + 2);

  return db.transaction(async (tx) => {
    for (const part of chunks(configRows)) {
      await tx.insert(configs).values(part).onConflictDoNothing();
    }
    for (const part of chunks(creatorRows)) {
      await tx.insert(creators).values(part).onConflictDoNothing();
    }

    // Resolve links against what the owner actually has (a re-run may find rows
    // created earlier under the same name).
    const configIds = new Map(
      (
        await tx
          .select({ id: configs.id, name: configs.configName })
          .from(configs)
          .where(eq(configs.userId, userId))
      ).map((c) => [c.name, c.id])
    );
    const creatorIds = new Map(
      (
        await tx
          .select({ id: creators.id, name: creators.username })
          .from(creators)
          .where(eq(creators.userId, userId))
      ).map((c) => [c.name, c.id])
    );

    let orphanVideos = 0;
    const videoRows = rawVideos.map((r) => {
      const creator = r.creator || r.Creator || "";
      const configName = r.configName || r["Config Name"] || "";
      const creatorId = creatorIds.get(creator) ?? null;
      if (!creatorId) orphanVideos++;
      return {
        id: r.id,
        userId,
        creatorId,
        configId: configIds.get(configName) ?? null,
        creatorUsername: nul(creator),
        configName: nul(configName),
        link: nul(r.link || r.Link),
        thumbnail: nul(r.thumbnail || r.Thumbnail),
        views: int(r.views || r.Views),
        likes: int(r.likes || r.Likes),
        comments: int(r.comments || r.Comments),
        analysis: nul(r.analysis || r.Analysis),
        newConcepts: nul(r.newConcepts || r["New Concepts"]),
        datePosted: date(r.datePosted || r["Date Posted"]),
        dateAdded: date(r.dateAdded || r["Date Added"]) ?? new Date(),
        starred: r.starred === "true",
      };
    });
    for (const part of chunks(videoRows)) {
      await tx.insert(videos).values(part).onConflictDoNothing();
    }

    return {
      configs: configRows.length,
      creators: creatorRows.length,
      videos: videoRows.length,
      orphanVideos,
    };
  });
}

// CLI entry (npm run migrate:csv -- --owner-email <email>). Skipped when imported by tests.
if (process.argv[1] && /migrate-csv\.[cm]?[jt]s$/.test(process.argv[1])) {
  const { values } = parseArgs({
    options: { "owner-email": { type: "string" }, "data-dir": { type: "string" } },
  });
  if (!values["owner-email"]) {
    console.error("Usage: migrate:csv --owner-email <email> [--data-dir <dir>]");
    process.exit(2);
  }
  const dataDir = path.resolve(values["data-dir"] ?? path.join(process.cwd(), "..", "data"));
  migrateCsv({ dataDir, ownerEmail: values["owner-email"] })
    .then((r) => {
      console.log(
        `migrated: ${r.configs} configs, ${r.creators} creators, ${r.videos} videos (${r.orphanVideos} orphan)`
      );
      process.exit(0);
    })
    .catch((e) => {
      if (e instanceof Error && /^(owner not found|invalid id)/.test(e.message)) console.error(e.message);
      else console.error("database error");
      process.exit(1);
    });
}
