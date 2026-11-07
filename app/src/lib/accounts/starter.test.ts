import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { configs, creators, users, videos } from "@/lib/db/schema";
import { resetDb } from "@/test/db";
import { copyStarterContent, findStarterOwnerId } from "./starter";

beforeEach(async () => {
  await resetDb();
});

async function mkUser(email: string, role: "admin" | "user", createdAt?: Date) {
  const [u] = await db
    .insert(users)
    .values({ email, name: email, passwordHash: "x", role, ...(createdAt ? { createdAt } : {}) })
    .returning();
  return u;
}

async function fixtureOwner() {
  const owner = await mkUser("owner@x.com", "admin", new Date("2024-01-01"));
  await db.insert(configs).values(
    [1, 2, 3].map((i) => ({
      userId: owner.id,
      configName: `cfg${i}`,
      creatorsCategory: `cat${i}`,
      analysisInstruction: `analysis ${i}`,
      newConceptsInstruction: `concepts ${i}`,
    }))
  );
  await db.insert(creators).values(
    Array.from({ length: 13 }, (_, i) => ({
      userId: owner.id,
      username: `creator${i}`,
      category: `cat${i % 3}`,
      followers: 100 + i,
      reelsCount30d: i,
      avgViews30d: 1000 * i,
      profilePicUrl: `http://p/${i}`,
    }))
  );
  return owner;
}

describe("copyStarterContent", () => {
  it("copies the owner configs and creators with new ids", async () => {
    const owner = await fixtureOwner();
    const fresh = await mkUser("new@x.com", "user");
    const res = await copyStarterContent(owner.id, fresh.id);
    expect(res).toEqual({ configs: 3, creators: 13 });

    const oc = await db.select().from(configs).where(eq(configs.userId, owner.id));
    const nc = await db.select().from(configs).where(eq(configs.userId, fresh.id));
    const ocr = await db.select().from(creators).where(eq(creators.userId, owner.id));
    const ncr = await db.select().from(creators).where(eq(creators.userId, fresh.id));
    expect(nc).toHaveLength(3);
    expect(ncr).toHaveLength(13);
    const strip = <T extends { id: string; userId: string }>(r: T) => {
      const { id: _i, userId: _u, ...rest } = r;
      return rest;
    };
    const byName = (a: { configName: string }, b: { configName: string }) =>
      a.configName.localeCompare(b.configName);
    const byUser = (a: { username: string }, b: { username: string }) =>
      a.username.localeCompare(b.username);
    expect(nc.sort(byName).map(strip)).toEqual(oc.sort(byName).map(strip));
    expect(ncr.sort(byUser).map(strip)).toEqual(ocr.sort(byUser).map(strip));

    const oldIds = new Set([...oc, ...ocr].map((r) => r.id));
    for (const r of [...nc, ...ncr]) {
      expect(oldIds.has(r.id)).toBe(false);
      expect(r.userId).toBe(fresh.id);
    }
  });

  it("editing the copy leaves the owner untouched", async () => {
    const owner = await fixtureOwner();
    const fresh = await mkUser("new@x.com", "user");
    await copyStarterContent(owner.id, fresh.id);
    const [mine] = await db.select().from(configs).where(eq(configs.userId, fresh.id));
    await db.update(configs).set({ analysisInstruction: "changed" }).where(eq(configs.id, mine.id));
    const ownerCfgs = await db.select().from(configs).where(eq(configs.userId, owner.id));
    expect(ownerCfgs.some((c) => c.analysisInstruction === "changed")).toBe(false);
    expect(ownerCfgs).toHaveLength(3);
  });

  it("does not copy videos", async () => {
    const owner = await fixtureOwner();
    await db.insert(videos).values({ userId: owner.id, link: "l" });
    const fresh = await mkUser("new@x.com", "user");
    await copyStarterContent(owner.id, fresh.id);
    expect(await db.select().from(videos).where(eq(videos.userId, fresh.id))).toHaveLength(0);
  });

  it("is atomic: a failure midway leaves nothing behind", async () => {
    const owner = await fixtureOwner();
    const fresh = await mkUser("new@x.com", "user");
    // Collides with an owner creator on (user_id, username) after configs are inserted.
    await db.insert(creators).values({ userId: fresh.id, username: "creator5" });
    await expect(copyStarterContent(owner.id, fresh.id)).rejects.toThrow();
    expect(await db.select().from(configs).where(eq(configs.userId, fresh.id))).toHaveLength(0);
    expect(await db.select().from(creators).where(eq(creators.userId, fresh.id))).toHaveLength(1);
  });

  it("copies nothing without an owner", async () => {
    const fresh = await mkUser("new@x.com", "user");
    expect(await copyStarterContent(null, fresh.id)).toEqual({ configs: 0, creators: 0 });
    expect(await copyStarterContent(fresh.id, fresh.id)).toEqual({ configs: 0, creators: 0 });
  });
});

describe("findStarterOwnerId", () => {
  it("returns the earliest admin, ignoring non-admins; null when none", async () => {
    expect(await findStarterOwnerId()).toBeNull();
    await mkUser("u@x.com", "user", new Date("2023-01-01"));
    expect(await findStarterOwnerId()).toBeNull();
    await mkUser("a2@x.com", "admin", new Date("2025-01-01"));
    const first = await mkUser("a1@x.com", "admin", new Date("2024-01-01"));
    expect(await findStarterOwnerId()).toBe(first.id);
  });
});
