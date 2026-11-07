import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { pipelineRuns, usageDaily, users } from "@/lib/db/schema";
import { resetDb } from "@/test/db";
import { createSession } from "@/lib/auth/session";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { createConfig } from "@/lib/repo/configs";
import { createCreator } from "@/lib/repo/creators";
import { todayInSaoPaulo } from "@/lib/quota/day";

// No real API calls: the production clients are replaced by fakes.
vi.mock("@/lib/apify", () => ({ scrapeReels: async () => [] }));
vi.mock("@/lib/gemini", () => ({
  uploadVideo: async () => {
    throw new Error("unexpected Gemini call");
  },
  analyzeVideo: async () => {
    throw new Error("unexpected Gemini call");
  },
}));
vi.mock("@/lib/claude", () => ({
  generateNewConcepts: async () => {
    throw new Error("unexpected Claude call");
  },
}));

import { POST } from "./route";

type U = { id: string; cookie: string };

async function mkUser(
  email: string,
  limits: { dailyRunsLimit?: number; dailyVideosLimit?: number } = {}
): Promise<U> {
  const [u] = await db
    .insert(users)
    .values({ email, name: email, passwordHash: "x", role: "user", ...limits })
    .returning();
  const { token } = await createSession(u.id);
  await createConfig(u.id, { configName: "Main", creatorsCategory: "fit" });
  await createCreator(u.id, { username: "c1", category: "fit" });
  return { id: u.id, cookie: `${SESSION_COOKIE}=${token}` };
}

const BODY = { configName: "Main", maxVideos: 5, topK: 3, nDays: 30 };

function req(user?: U, body: unknown = BODY): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (user) headers.cookie = user.cookie;
  return new Request("http://localhost/api/pipeline", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function runsOf(userId: string) {
  return db.select().from(pipelineRuns).where(eq(pipelineRuns.userId, userId));
}

beforeEach(async () => {
  await resetDb();
});

describe("POST /api/pipeline", () => {
  it("requires a session", async () => {
    expect((await POST(req())).status).toBe(401);
  });

  it("rejects invalid params", async () => {
    const u = await mkUser("a@x.com");
    expect((await POST(req(u, { ...BODY, topK: 0 }))).status).toBe(400);
    expect((await POST(req(u, { ...BODY, maxVideos: 1e12 }))).status).toBe(400);
    expect(await runsOf(u.id)).toHaveLength(0);
  });

  it("returns 409 busy while the user has a run in progress", async () => {
    const u = await mkUser("a@x.com");
    await db.insert(pipelineRuns).values({ userId: u.id, status: "running" });
    const res = await POST(req(u));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "busy" });
  });

  it("returns 429 runs_exhausted and leaves no running run behind", async () => {
    const u = await mkUser("a@x.com", { dailyRunsLimit: 0 });
    const res = await POST(req(u));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "runs_exhausted" });
    const rows = await runsOf(u.id);
    expect(rows.map((r) => r.status)).toEqual(["failed"]);
  });

  it("returns 429 videos_exhausted when no video analysis is left today", async () => {
    const u = await mkUser("a@x.com", { dailyVideosLimit: 2 });
    await db.insert(usageDaily).values({ userId: u.id, day: todayInSaoPaulo(), runs: 0, videos: 2 });
    const res = await POST(req(u));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "videos_exhausted" });
    expect(await runsOf(u.id)).toHaveLength(0);
  });

  it("streams progress and closes the run as done", async () => {
    const u = await mkUser("a@x.com");
    const res = await POST(req(u));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const events = (await res.text())
      .split("\n\n")
      .filter((l) => l.startsWith("data: "))
      .map((l) => JSON.parse(l.slice(6)));
    expect(events.at(-1).status).toBe("completed");
    // The run is closed after the stream ends; give the finally hook a moment.
    await vi.waitFor(async () => {
      expect((await runsOf(u.id)).map((r) => r.status)).toEqual(["done"]);
    });
  });
});
