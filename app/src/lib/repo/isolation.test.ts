import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { adminAudit, users, videos } from "@/lib/db/schema";
import { resetDb } from "@/test/db";
import type { SessionUser } from "@/lib/auth/session";
import { resolveTargetUserId } from "./scope";
import { createConfig, deleteConfig, getConfig, listConfigs, updateConfig } from "./configs";
import {
  createCreator,
  deleteCreator,
  getCreator,
  listCreators,
  updateCreator,
} from "./creators";
import { listVideos, setVideoStarred } from "./videos";
import { recordAdminAction } from "./admin-audit";

async function mkUser(email: string, role: "admin" | "user" = "user"): Promise<SessionUser> {
  const [u] = await db
    .insert(users)
    .values({ email, name: email, passwordHash: "x", role })
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

function ok<R extends object>(r: R): Exclude<R, { error: string }> {
  if ("error" in r) throw new Error(`setup failed: ${String(r.error)}`);
  return r as Exclude<R, { error: string }>;
}

let A: SessionUser, B: SessionUser, admin: SessionUser;
let cfgB: { id: string; configName: string };
let crB: { id: string; username: string };
let vidB: { id: string };

beforeEach(async () => {
  await resetDb();
  A = await mkUser("a@x.com");
  B = await mkUser("b@x.com");
  admin = await mkUser("admin@x.com", "admin");
  await createConfig(A.id, { configName: "cfg" });
  cfgB = ok(await createConfig(B.id, { configName: "cfg" }));
  await createCreator(A.id, { username: "alice", category: "fit" });
  crB = ok(await createCreator(B.id, { username: "bob" }));
  [vidB] = await db
    .insert(videos)
    .values({ userId: B.id, configName: "cfg", creatorUsername: "bob", starred: false })
    .returning();
  await db.insert(videos).values({ userId: A.id, configName: "cfg", creatorUsername: "alice" });
  await db.insert(videos).values({ userId: A.id, configName: "other", creatorUsername: "alice" });
});

describe("configs isolation", () => {
  it("lists only own configs", async () => {
    const list = await listConfigs(A.id);
    expect(list.map((c) => c.id)).not.toContain(cfgB.id);
    expect(list).toHaveLength(1);
  });
  it("get/update/delete of another account's config does nothing", async () => {
    expect(await getConfig(A.id, cfgB.id)).toBeUndefined();
    expect(await updateConfig(A.id, cfgB.id, { configName: "x" })).toBeUndefined();
    expect(await deleteConfig(A.id, cfgB.id)).toBe(false);
    expect((await getConfig(B.id, cfgB.id))?.configName).toBe("cfg");
  });
  it("rename into an existing name returns duplicate on update", async () => {
    const mine = ok(await createConfig(A.id, { configName: "second" }));
    expect(await updateConfig(A.id, mine.id, { configName: "cfg" })).toEqual({ error: "duplicate" });
  });
  it("all-undefined patch returns the current row, or undefined if missing", async () => {
    const [mine] = await listConfigs(A.id);
    expect((await updateConfig(A.id, mine.id, { configName: undefined }))).toMatchObject({ id: mine.id });
    expect(await updateConfig(A.id, cfgB.id, { configName: undefined })).toBeUndefined();
  });
  it("returns duplicate on repeated name", async () => {
    expect(await createConfig(A.id, { configName: "cfg" })).toEqual({ error: "duplicate" });
  });
});

describe("creators isolation", () => {
  it("lists only own creators", async () => {
    const list = await listCreators(A.id);
    expect(list.map((c) => c.id)).not.toContain(crB.id);
    expect(list).toHaveLength(1);
  });
  it("get/update/delete of another account's creator does nothing", async () => {
    expect(await getCreator(A.id, crB.id)).toBeUndefined();
    expect(await updateCreator(A.id, crB.id, { username: "x" })).toBeUndefined();
    expect(await deleteCreator(A.id, crB.id)).toBe(false);
    expect((await getCreator(B.id, crB.id))?.username).toBe("bob");
  });
  it("normalizes username and flags duplicates", async () => {
    const c = await createCreator(A.id, { username: "@Marcel.Remus" });
    expect("username" in c && c.username).toBe("marcel.remus");
    expect(await createCreator(A.id, { username: " @MARCEL.remus " })).toEqual({
      error: "duplicate",
    });
  });
  it("rename into an existing username returns duplicate on update", async () => {
    const mine = ok(await createCreator(A.id, { username: "second" }));
    expect(await updateCreator(A.id, mine.id, { username: "@Alice" })).toEqual({ error: "duplicate" });
  });
  it("all-undefined patch returns the current row, or undefined if missing", async () => {
    const [mine] = await listCreators(A.id);
    expect(await updateCreator(A.id, mine.id, { username: undefined })).toMatchObject({ id: mine.id });
    expect(await updateCreator(A.id, crB.id, { username: undefined })).toBeUndefined();
  });
  it("filters by category", async () => {
    await createCreator(A.id, { username: "carl", category: "food" });
    expect((await listCreators(A.id, "food")).map((c) => c.username)).toEqual(["carl"]);
    expect((await listCreators(A.id, "fit")).map((c) => c.username)).toEqual(["alice"]);
  });
  it("normalizes username on update", async () => {
    const [mine] = await listCreators(A.id);
    const u = await updateCreator(A.id, mine.id, { username: "@Zed" });
    expect(u && "username" in u && u.username).toBe("zed");
  });
});

describe("videos isolation", () => {
  it("lists only own videos", async () => {
    const list = await listVideos(A.id, {});
    expect(list).toHaveLength(2);
    expect(list.every((v) => v.userId === A.id)).toBe(true);
    const only = await listVideos(A.id, { configName: "other" });
    expect(only).toHaveLength(1);
    expect(only[0].configName).toBe("other");
    expect(await listVideos(A.id, { creator: "bob" })).toHaveLength(0);
  });
  it("setVideoStarred cannot touch another account's video", async () => {
    expect(await setVideoStarred(A.id, vidB.id, true)).toBeUndefined();
    const [row] = await db.select().from(videos).where(eq(videos.id, vidB.id));
    expect(row.starred).toBe(false);
    expect((await setVideoStarred(B.id, vidB.id, true))?.starred).toBe(true);
  });
});

describe("resolveTargetUserId", () => {
  it("defaults to self", () => {
    expect(resolveTargetUserId(A, null)).toEqual({ userId: A.id, viaAdmin: false });
    expect(resolveTargetUserId(A, A.id)).toEqual({ userId: A.id, viaAdmin: false });
  });
  it("forbids a regular user targeting another", () => {
    expect(resolveTargetUserId(A, B.id)).toEqual({ error: "forbidden" });
  });
  it("rejects non-UUID values for everyone", () => {
    for (const bad of ["", "not-a-uuid"]) {
      expect(resolveTargetUserId(A, bad)).toEqual({ error: "forbidden" });
      expect(resolveTargetUserId(admin, bad)).toEqual({ error: "forbidden" });
    }
  });
  it("lets an admin target another", () => {
    expect(resolveTargetUserId(admin, B.id)).toEqual({ userId: B.id, viaAdmin: true });
  });
});

describe("recordAdminAction", () => {
  it("inserts an audit row", async () => {
    await recordAdminAction({
      adminId: admin.id,
      targetUserId: B.id,
      action: "view",
      detail: { a: 1 },
    });
    const rows = await db.select().from(adminAudit);
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("view");
  });
});
