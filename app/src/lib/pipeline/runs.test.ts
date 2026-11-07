import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { pipelineRuns, users, videos } from "@/lib/db/schema";
import { resetDb } from "@/test/db";
import type { SessionUser } from "@/lib/auth/session";
import { createConfig, deleteConfig } from "@/lib/repo/configs";
import { createCreator, deleteCreator } from "@/lib/repo/creators";
import type { ApifyReel } from "@/lib/apify";
import type { PipelineDeps, PipelineEvent } from "@/lib/pipeline";
import type { PipelineParams } from "@/lib/types";
import { executeRun, finishRun, markStaleRuns, startRun } from "./runs";

async function mkUser(
  email: string,
  role: "admin" | "user" = "user",
  limits: { dailyRunsLimit?: number; dailyVideosLimit?: number } = {}
): Promise<SessionUser> {
  const [u] = await db
    .insert(users)
    .values({ email, name: email, passwordHash: "x", role, ...limits })
    .returning();
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    active: u.active,
    dailyRunsLimit: u.dailyRunsLimit,
    dailyVideosLimit: u.dailyVideosLimit,
  };
}

const PARAMS: PipelineParams = { configName: "Main", maxVideos: 20, topK: 10, nDays: 30 };

function reels(n: number, username = "creator1"): ApifyReel[] {
  const ts = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  return Array.from({ length: n }, (_, i) => ({
    videoUrl: `https://cdn.example/v${i}.mp4`,
    url: `https://www.instagram.com/reel/${username}-${i}/`,
    videoPlayCount: 1000 * (i + 1),
    likesCount: 10,
    commentsCount: 1,
    ownerUsername: username,
    images: [`https://cdn.example/t${i}.jpg`],
    timestamp: ts,
  }));
}

function fakeDeps(scraped: ApifyReel[], onAnalyze?: () => Promise<void>) {
  const calls = { scrape: 0, analyze: 0, concepts: 0, claude: 0, deepseek: 0 };
  const deps: PipelineDeps = {
    scrapeReels: async () => {
      calls.scrape++;
      return scraped;
    },
    analyzeVideo: async () => {
      calls.analyze++;
      if (onAnalyze) await onAnalyze();
      return "analysis";
    },
    conceptGenerators: {
      claude: async () => {
        calls.concepts++;
        calls.claude++;
        return "concepts";
      },
      deepseek: async () => {
        calls.concepts++;
        calls.deepseek++;
        return "deepseek concepts";
      },
    },
  };
  return { deps, calls };
}

async function seedOwnerData(userId: string) {
  const config = await createConfig(userId, {
    configName: "Main",
    creatorsCategory: "fitness",
    analysisInstruction: "analyze",
    newConceptsInstruction: "adapt",
  });
  const creator = await createCreator(userId, { username: "creator1", category: "fitness" });
  if ("error" in config || "error" in creator) throw new Error("seed failed");
  return { config, creator };
}

async function runStatus(runId: string) {
  const [row] = await db.select().from(pipelineRuns).where(eq(pipelineRuns.id, runId));
  return row;
}

beforeEach(async () => {
  await resetDb();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const LEAKS = ["Failed query", "params:", "APIFY_API_TOKEN", "insert into"];

function expectNoLeaks(events: PipelineEvent[]) {
  const payload = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
  for (const s of LEAKS) expect(payload).not.toContain(s);
}

describe("startRun / finishRun", () => {
  it("allows one running execution per user; accounts are independent", async () => {
    const a = await mkUser("a@x.com");
    const b = await mkUser("b@x.com");

    const first = await startRun(a.id, PARAMS);
    expect(first).toHaveProperty("runId");
    expect(await startRun(a.id, PARAMS)).toEqual({ error: "busy" });
    expect(await startRun(b.id, PARAMS)).toHaveProperty("runId");
  });

  it("is race-safe: simultaneous starts for the same user yield one run", async () => {
    const a = await mkUser("a@x.com");
    // Warm the pool so the starts really run on separate connections at the same time.
    await Promise.all(Array.from({ length: 8 }, () => db.execute(sql`select pg_sleep(0.05)`)));
    const results = await Promise.all(Array.from({ length: 8 }, () => startRun(a.id, PARAMS)));
    expect(results.filter((r) => "runId" in r)).toHaveLength(1);
    expect(results.filter((r) => "error" in r)).toHaveLength(7);
    const rows = await db.select().from(pipelineRuns).where(eq(pipelineRuns.userId, a.id));
    expect(rows).toHaveLength(1);
  });

  it("finishRun releases the user for a new execution and stores status and log", async () => {
    const a = await mkUser("a@x.com");
    const first = await startRun(a.id, PARAMS);
    if (!("runId" in first)) throw new Error("expected runId");

    await finishRun(first.runId, "done", ["line 1"]);
    const row = await runStatus(first.runId);
    expect(row.status).toBe("done");
    expect(row.finishedAt).toBeInstanceOf(Date);
    expect(row.log).toEqual(["line 1"]);

    expect(await startRun(a.id, PARAMS)).toHaveProperty("runId");
  });

  it("self-heals: an orphaned running row older than 15 minutes does not block", async () => {
    const a = await mkUser("a@x.com");
    const b = await mkUser("b@x.com");
    const now = new Date();
    const [orphan] = await db
      .insert(pipelineRuns)
      .values({ userId: a.id, status: "running", startedAt: new Date(now.getTime() - 16 * 60_000) })
      .returning();
    const [otherUsers] = await db
      .insert(pipelineRuns)
      .values({ userId: b.id, status: "running", startedAt: new Date(now.getTime() - 16 * 60_000) })
      .returning();

    expect(await startRun(a.id, PARAMS, now)).toHaveProperty("runId");
    expect((await runStatus(orphan.id)).status).toBe("timed_out");
    // Only the starting user's rows are touched.
    expect((await runStatus(otherUsers.id)).status).toBe("running");
  });

  it("still reports busy for a running row younger than 15 minutes", async () => {
    const a = await mkUser("a@x.com");
    const now = new Date();
    await db
      .insert(pipelineRuns)
      .values({ userId: a.id, status: "running", startedAt: new Date(now.getTime() - 14 * 60_000) });
    expect(await startRun(a.id, PARAMS, now)).toEqual({ error: "busy" });
  });
});

describe("markStaleRuns", () => {
  it("times out running executions older than 15 minutes and leaves recent ones", async () => {
    const a = await mkUser("a@x.com");
    const b = await mkUser("b@x.com");
    const now = new Date("2026-11-10T15:00:00Z");
    const [old] = await db
      .insert(pipelineRuns)
      .values({ userId: a.id, status: "running", startedAt: new Date(now.getTime() - 16 * 60_000) })
      .returning();
    const [recent] = await db
      .insert(pipelineRuns)
      .values({ userId: b.id, status: "running", startedAt: new Date(now.getTime() - 5 * 60_000) })
      .returning();

    expect(await markStaleRuns(now)).toBe(1);
    expect((await runStatus(old.id)).status).toBe("timed_out");
    expect((await runStatus(old.id)).finishedAt).toBeInstanceOf(Date);
    expect((await runStatus(recent.id)).status).toBe("running");
  });
});

describe("executeRun", () => {
  it("analyzes only as many videos as the video quota grants and reports limitedTo", async () => {
    const user = await mkUser("a@x.com", "user", { dailyVideosLimit: 3 });
    const { config, creator } = await seedOwnerData(user.id);
    const { deps, calls } = fakeDeps(reels(10));
    const events: PipelineEvent[] = [];

    const started = await startRun(user.id, PARAMS);
    if (!("runId" in started)) throw new Error("expected runId");
    await executeRun(started.runId, PARAMS, (e) => events.push(e), { userId: user.id, user }, deps);

    expect(calls.analyze).toBe(3);
    expect(calls.concepts).toBe(3);
    const limited = events.filter((e) => e.limitedTo !== undefined);
    expect(limited[0].limitedTo).toBe(3);
    expect(limited[0].videosRemaining).toBe(0);

    const rows = await db.select().from(videos).where(eq(videos.userId, user.id));
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.creatorId).toBe(creator.id);
      expect(r.configId).toBe(config.id);
      expect(r.configName).toBe("Main");
      expect(r.creatorUsername).toBe("creator1");
    }
    // The three most viewed reels were kept.
    expect(rows.map((r) => r.views).sort((x, y) => (y ?? 0) - (x ?? 0))).toEqual([10000, 9000, 8000]);
    expect((await runStatus(started.runId)).status).toBe("done");
  });

  it("finishes with status done when the creator has no reels in the period", async () => {
    const user = await mkUser("a@x.com");
    await seedOwnerData(user.id);
    const { deps, calls } = fakeDeps([]);
    const events: PipelineEvent[] = [];

    const started = await startRun(user.id, PARAMS);
    if (!("runId" in started)) throw new Error("expected runId");
    await executeRun(started.runId, PARAMS, (e) => events.push(e), { userId: user.id, user }, deps);

    expect(calls.analyze).toBe(0);
    expect(events.at(-1)?.status).toBe("completed");
    const row = await runStatus(started.runId);
    expect(row.status).toBe("done");
    expect(Array.isArray(row.log)).toBe(true);
  });

  it("marks the run failed when the config does not belong to the user", async () => {
    const owner = await mkUser("owner@x.com");
    await seedOwnerData(owner.id);
    const other = await mkUser("other@x.com");
    const { deps, calls } = fakeDeps(reels(2));

    const started = await startRun(other.id, PARAMS);
    if (!("runId" in started)) throw new Error("expected runId");
    await executeRun(started.runId, PARAMS, () => {}, { userId: other.id, user: other }, deps);

    expect(calls.scrape).toBe(0);
    expect((await runStatus(started.runId)).status).toBe("failed");
  });

  it("writes the video with creatorId null when the creator is deleted mid-run", async () => {
    const user = await mkUser("a@x.com");
    const { config, creator } = await seedOwnerData(user.id);
    const { deps } = fakeDeps(reels(1), async () => {
      await deleteCreator(user.id, creator.id);
    });

    const started = await startRun(user.id, PARAMS);
    if (!("runId" in started)) throw new Error("expected runId");
    await executeRun(started.runId, PARAMS, () => {}, { userId: user.id, user }, deps);

    const rows = await db.select().from(videos).where(eq(videos.userId, user.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].creatorId).toBeNull();
    expect(rows[0].configId).toBe(config.id);
    expect(rows[0].creatorUsername).toBe("creator1");
  });

  it("keeps the creator id when only the config vanishes between check and insert", async () => {
    const user = await mkUser("a@x.com");
    const { config, creator } = await seedOwnerData(user.id);
    const { deps } = fakeDeps(reels(1));
    const fkError = Object.assign(new Error("violates foreign key constraint"), { code: "23503" });
    vi.spyOn(db, "insert").mockImplementationOnce((() => ({
      values: async () => {
        await deleteConfig(user.id, config.id);
        throw fkError;
      },
    })) as never);

    const started = await startRun(user.id, PARAMS);
    if (!("runId" in started)) throw new Error("expected runId");
    await executeRun(started.runId, PARAMS, () => {}, { userId: user.id, user }, deps);

    const rows = await db.select().from(videos).where(eq(videos.userId, user.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].configId).toBeNull();
    expect(rows[0].creatorId).toBe(creator.id);
  });

  it("never sends raw DB errors to the client; keeps them in the run log", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = await mkUser("a@x.com");
    await seedOwnerData(user.id);
    const { deps } = fakeDeps(reels(1));
    vi.spyOn(db, "insert").mockImplementationOnce((() => ({
      values: async () => {
        throw new Error(
          'Failed query: insert into "videos" ("user_id") values ($1)\nparams: secret-value,APIFY_API_TOKEN'
        );
      },
    })) as never);
    const events: PipelineEvent[] = [];

    const started = await startRun(user.id, PARAMS);
    if (!("runId" in started)) throw new Error("expected runId");
    await executeRun(started.runId, PARAMS, (e) => events.push(e), { userId: user.id, user }, deps);

    expectNoLeaks(events);
    expect(JSON.stringify(events)).not.toContain("secret-value");
    expect(events.at(-1)!.errors[0]).toContain("Falha ao salvar vídeo");
    const row = await runStatus(started.runId);
    expect(JSON.stringify(row.log)).toContain("Failed query");
  });

  it("replaces upstream (Apify) errors with a fixed message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = await mkUser("a@x.com");
    await seedOwnerData(user.id);
    const deps: PipelineDeps = {
      ...fakeDeps([]).deps,
      scrapeReels: async () => {
        throw new Error("APIFY_API_TOKEN not set; Apify error 401: {\"token\":\"abc\"}");
      },
    };
    const events: PipelineEvent[] = [];

    const started = await startRun(user.id, PARAMS);
    if (!("runId" in started)) throw new Error("expected runId");
    await executeRun(started.runId, PARAMS, (e) => events.push(e), { userId: user.id, user }, deps);

    expectNoLeaks(events);
    expect(JSON.stringify(events)).not.toContain("abc");
    expect(events.at(-1)!.errors).toEqual(["Falha ao buscar reels de @creator1"]);
    expect(JSON.stringify((await runStatus(started.runId)).log)).toContain("APIFY_API_TOKEN");
  });

  it("ends with an explicit terminal event", async () => {
    const user = await mkUser("a@x.com");
    await seedOwnerData(user.id);
    const events: PipelineEvent[] = [];
    const started = await startRun(user.id, PARAMS);
    if (!("runId" in started)) throw new Error("expected runId");
    await executeRun(started.runId, PARAMS, (e) => events.push(e), { userId: user.id, user }, fakeDeps([]).deps);
    const last = events.at(-1)!;
    expect(last.status).toBe("completed");
    expect(last.phase).toBe("done");
    expect(last.activeTasks).toEqual([]);
  });

  it("reports unlimited remaining quota for admins as null, never Infinity", async () => {
    const admin = await mkUser("admin@x.com", "admin");
    await seedOwnerData(admin.id);
    const { deps, calls } = fakeDeps(reels(4));
    const events: PipelineEvent[] = [];

    const started = await startRun(admin.id, PARAMS);
    if (!("runId" in started)) throw new Error("expected runId");
    await executeRun(started.runId, PARAMS, (e) => events.push(e), { userId: admin.id, user: admin }, deps);

    expect(calls.analyze).toBe(4);
    expect(events.some((e) => e.limitedTo !== undefined)).toBe(false);
    const last = events.at(-1)!;
    expect(last.videosRemaining).toBeNull();
    expect(JSON.stringify(events)).not.toContain("Infinity");
  });
});

describe("concept provider", () => {
  async function runWith(params: PipelineParams) {
    const user = await mkUser("p@x.com");
    await seedOwnerData(user.id);
    const { deps, calls } = fakeDeps(reels(2));
    const events: PipelineEvent[] = [];
    const started = await startRun(user.id, params);
    if (!("runId" in started)) throw new Error("expected runId");
    await executeRun(started.runId, params, (e) => events.push(e), { userId: user.id, user }, deps);
    const saved = await db.select().from(videos).where(eq(videos.userId, user.id));
    return { calls, events, saved, run: await runStatus(started.runId) };
  }

  it("uses the DeepSeek generator when provider is deepseek", async () => {
    const { calls, events, saved, run } = await runWith({ ...PARAMS, provider: "deepseek" });
    expect(calls.deepseek).toBe(2);
    expect(calls.claude).toBe(0);
    expect(saved.map((v) => v.newConcepts)).toEqual(["deepseek concepts", "deepseek concepts"]);
    expect(events.at(-1)!.log.some((l) => l.includes("DeepSeek gerando conceitos"))).toBe(true);
    expect(run.params).toMatchObject({ provider: "deepseek" });
  });

  it("uses the Claude generator when provider is claude", async () => {
    const { calls } = await runWith({ ...PARAMS, provider: "claude" });
    expect(calls.claude).toBe(2);
    expect(calls.deepseek).toBe(0);
  });

  it("defaults to Claude when provider is missing", async () => {
    const { calls, events } = await runWith(PARAMS);
    expect(calls.claude).toBe(2);
    expect(calls.deepseek).toBe(0);
    expect(events.at(-1)!.log.some((l) => l.includes("Claude gerando conceitos"))).toBe(true);
  });
});
