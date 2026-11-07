import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { resetDb } from "@/test/db";
import type { SessionUser } from "@/lib/auth/session";
import { todayInSaoPaulo } from "./day";
import { getUsageToday, reserveRun, reserveVideos } from "./quota";

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

// 2026-11-10 12:00 in São Paulo (UTC-3) = 15:00 UTC.
const NOON = new Date("2026-11-10T15:00:00Z");

beforeEach(async () => {
  await resetDb();
});

describe("todayInSaoPaulo", () => {
  it("formats the São Paulo calendar day as YYYY-MM-DD", () => {
    expect(todayInSaoPaulo(NOON)).toBe("2026-11-10");
  });

  it("rolls over at midnight São Paulo time, not UTC", () => {
    // 23:30 on 10/11 in São Paulo = 02:30 UTC on 11/11.
    const lateNight = new Date("2026-11-11T02:30:00Z");
    // 00:10 on 11/11 in São Paulo = 03:10 UTC on 11/11.
    const afterMidnight = new Date("2026-11-11T03:10:00Z");
    expect(todayInSaoPaulo(lateNight)).toBe("2026-11-10");
    expect(todayInSaoPaulo(afterMidnight)).toBe("2026-11-11");
  });
});

describe("reserveRun", () => {
  it("allows exactly dailyRunsLimit runs per day", async () => {
    const u = await mkUser("u@x.com", "user", { dailyRunsLimit: 5 });
    for (let i = 0; i < 5; i++) {
      expect(await reserveRun(u, NOON)).toEqual({ ok: true });
    }
    expect(await reserveRun(u, NOON)).toEqual({ ok: false, reason: "runs_exhausted" });
    expect(await getUsageToday(u.id, NOON)).toEqual({ runs: 5, videos: 0 });
  });

  it("grants exactly one of two concurrent reservations when one run is left", async () => {
    const u = await mkUser("u@x.com", "user", { dailyRunsLimit: 5 });
    for (let i = 0; i < 4; i++) await reserveRun(u, NOON);
    const results = await Promise.all([reserveRun(u, NOON), reserveRun(u, NOON)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, reason: "runs_exhausted" }]);
    expect((await getUsageToday(u.id, NOON)).runs).toBe(5);
  });

  it("never exceeds the limit under a burst of concurrent reservations on a fresh day", async () => {
    const u = await mkUser("u@x.com", "user", { dailyRunsLimit: 3 });
    const results = await Promise.all(Array.from({ length: 8 }, () => reserveRun(u, NOON)));
    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect((await getUsageToday(u.id, NOON)).runs).toBe(3);
  });

  it("refuses every run when the limit is 0", async () => {
    const u = await mkUser("u@x.com", "user", { dailyRunsLimit: 0 });
    expect(await reserveRun(u, NOON)).toEqual({ ok: false, reason: "runs_exhausted" });
    expect(await getUsageToday(u.id, NOON)).toEqual({ runs: 0, videos: 0 });
  });

  it("starts a new count on the next São Paulo day", async () => {
    const u = await mkUser("u@x.com", "user", { dailyRunsLimit: 1 });
    const lateNight = new Date("2026-11-11T02:30:00Z"); // 23:30 on 10/11 SP
    const afterMidnight = new Date("2026-11-11T03:10:00Z"); // 00:10 on 11/11 SP
    expect(await reserveRun(u, lateNight)).toEqual({ ok: true });
    expect(await reserveRun(u, lateNight)).toEqual({ ok: false, reason: "runs_exhausted" });
    expect(await reserveRun(u, afterMidnight)).toEqual({ ok: true });
    expect((await getUsageToday(u.id, lateNight)).runs).toBe(1);
    expect((await getUsageToday(u.id, afterMidnight)).runs).toBe(1);
  });
});

describe("reserveVideos", () => {
  it("grants only what is left of the daily video limit", async () => {
    const u = await mkUser("u@x.com", "user", { dailyVideosLimit: 100 });
    expect(await reserveVideos(u, 70, NOON)).toEqual({ granted: 70, remaining: 30 });
    expect(await reserveVideos(u, 60, NOON)).toEqual({ granted: 30, remaining: 0 });
    expect(await reserveVideos(u, 10, NOON)).toEqual({ granted: 0, remaining: 0 });
    expect(await getUsageToday(u.id, NOON)).toEqual({ runs: 0, videos: 100 });
  });

  it("never grants more than the limit across concurrent reservations", async () => {
    const u = await mkUser("u@x.com", "user", { dailyVideosLimit: 100 });
    await reserveVideos(u, 70, NOON);
    const results = await Promise.all([reserveVideos(u, 20, NOON), reserveVideos(u, 20, NOON)]);
    const granted = results.map((r) => r.granted).sort((a, b) => a - b);
    expect(granted).toEqual([10, 20]);
    expect((await getUsageToday(u.id, NOON)).videos).toBe(100);
  });

  it("never grants more than the limit across concurrent reservations on a fresh day", async () => {
    const u = await mkUser("u@x.com", "user", { dailyVideosLimit: 50 });
    const results = await Promise.all(
      Array.from({ length: 6 }, () => reserveVideos(u, 15, NOON))
    );
    expect(results.reduce((s, r) => s + r.granted, 0)).toBe(50);
    expect((await getUsageToday(u.id, NOON)).videos).toBe(50);
  });
});

describe("admin", () => {
  it("is never limited", async () => {
    const admin = await mkUser("admin@x.com", "admin", { dailyRunsLimit: 1, dailyVideosLimit: 1 });
    for (let i = 0; i < 10; i++) {
      expect(await reserveRun(admin, NOON)).toEqual({ ok: true });
    }
    const v = await reserveVideos(admin, 500, NOON);
    expect(v.granted).toBe(500);
  });
});

describe("getUsageToday", () => {
  it("returns zeros when nothing was used", async () => {
    const u = await mkUser("u@x.com");
    expect(await getUsageToday(u.id, NOON)).toEqual({ runs: 0, videos: 0 });
  });
});
