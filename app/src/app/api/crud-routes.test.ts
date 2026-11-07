import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { adminAudit, configs, creators, users, videos } from "@/lib/db/schema";
import { resetDb } from "@/test/db";
import { createSession } from "@/lib/auth/session";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { createConfig } from "@/lib/repo/configs";
import { createCreator } from "@/lib/repo/creators";

const scraper = vi.hoisted(() => ({
  calls: [] as string[],
  fail: false,
  beforeReturn: undefined as undefined | ((username: string) => Promise<void>),
}));
vi.mock("@/lib/apify", () => ({
  scrapeCreatorStats: async (username: string) => {
    scraper.calls.push(username);
    if (scraper.fail) throw new Error("scrape failed");
    await scraper.beforeReturn?.(username);
    return { profilePicUrl: `pic-${username}`, followers: 10, reelsCount30d: 2, avgViews30d: 300 };
  },
}));

import * as configsRoute from "./configs/route";
import * as creatorsRoute from "./creators/route";
import * as refreshRoute from "./creators/refresh/route";
import * as videosRoute from "./videos/route";

type U = { id: string; cookie: string };

async function mkUser(email: string, role: "admin" | "user" = "user"): Promise<U> {
  const [u] = await db
    .insert(users)
    .values({ email, name: email, passwordHash: "x", role })
    .returning();
  const { token } = await createSession(u.id);
  return { id: u.id, cookie: `${SESSION_COOKIE}=${token}` };
}

function req(
  path: string,
  init: { method?: string; user?: U; body?: unknown; rawBody?: string } = {}
): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init.user) headers.cookie = init.user.cookie;
  const body =
    init.rawBody !== undefined
      ? init.rawBody
      : init.body !== undefined
        ? JSON.stringify(init.body)
        : undefined;
  return new Request(`http://localhost${path}`, { method: init.method ?? "GET", headers, body });
}

function ok<R extends object>(r: R): Exclude<R, { error: string }> {
  if ("error" in r) throw new Error(`setup failed: ${String(r.error)}`);
  return r as Exclude<R, { error: string }>;
}

async function readStream(res: Response): Promise<Array<Record<string, unknown>>> {
  const text = await res.text();
  return text
    .split("\n")
    .filter((l) => l.startsWith("data: "))
    .map((l) => JSON.parse(l.slice(6)));
}

const MISSING_UUID = "00000000-0000-4000-8000-000000000000";

let A: U, B: U, admin: U;
let cfgA: { id: string }, cfgB: { id: string };
let crA: { id: string }, crB: { id: string };
let vidA: { id: string }, vidB: { id: string };

beforeEach(async () => {
  scraper.calls = [];
  scraper.fail = false;
  scraper.beforeReturn = undefined;
  await resetDb();
  A = await mkUser("a@x.com");
  B = await mkUser("b@x.com");
  admin = await mkUser("admin@x.com", "admin");
  cfgA = ok(await createConfig(A.id, { configName: "cfg", creatorsCategory: "fit" }));
  cfgB = ok(await createConfig(B.id, { configName: "cfg-b" }));
  crA = ok(await createCreator(A.id, { username: "alice", category: "fit" }));
  crB = ok(await createCreator(B.id, { username: "bob", category: "fit" }));
  [vidA] = await db
    .insert(videos)
    .values({
      userId: A.id,
      configName: "cfg",
      creatorUsername: "alice",
      views: 5,
      datePosted: new Date("2026-10-01T12:00:00Z"),
      dateAdded: new Date("2026-10-02T12:00:00Z"),
    })
    .returning();
  [vidB] = await db
    .insert(videos)
    .values({ userId: B.id, configName: "cfg-b", creatorUsername: "bob", starred: false })
    .returning();
});

describe("authentication", () => {
  it("returns 401 without a session cookie on every route", async () => {
    const calls: Array<Promise<Response>> = [
      configsRoute.GET(req("/api/configs")),
      configsRoute.POST(req("/api/configs", { method: "POST", body: { configName: "x" } })),
      configsRoute.PUT(req("/api/configs", { method: "PUT", body: { id: cfgA.id } })),
      configsRoute.DELETE(req(`/api/configs?id=${cfgA.id}`, { method: "DELETE" })),
      creatorsRoute.GET(req("/api/creators")),
      creatorsRoute.POST(req("/api/creators", { method: "POST", body: { username: "x" } })),
      creatorsRoute.PUT(req("/api/creators", { method: "PUT", body: { id: crA.id } })),
      creatorsRoute.DELETE(req(`/api/creators?id=${crA.id}`, { method: "DELETE" })),
      refreshRoute.POST(req("/api/creators/refresh", { method: "POST", body: { ids: [] } })),
      videosRoute.GET(req("/api/videos")),
      videosRoute.PATCH(req("/api/videos", { method: "PATCH", body: { id: vidA.id, starred: true } })),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status).toBe(401);
    }
    expect(scraper.calls).toEqual([]);
  });
});

describe("/api/configs", () => {
  it("GET lists only the caller's configs in the legacy shape", async () => {
    const res = await configsRoute.GET(req("/api/configs", { user: A }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      {
        id: cfgA.id,
        configName: "cfg",
        creatorsCategory: "fit",
        analysisInstruction: "",
        newConceptsInstruction: "",
      },
    ]);
  });

  it("GET ?userId=B by a regular user is 403", async () => {
    const res = await configsRoute.GET(req(`/api/configs?userId=${B.id}`, { user: A }));
    expect(res.status).toBe(403);
  });

  it("GET ?userId=B by an admin returns B's configs", async () => {
    const res = await configsRoute.GET(req(`/api/configs?userId=${B.id}`, { user: admin }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.map((c: { id: string }) => c.id)).toEqual([cfgB.id]);
  });

  it("GET ?userId=<unknown uuid> by an admin is 404", async () => {
    const res = await configsRoute.GET(req(`/api/configs?userId=${MISSING_UUID}`, { user: admin }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "usuário não encontrado" });
  });

  it("POST creates for the caller, ignores unknown fields, 409 on duplicate", async () => {
    const res = await configsRoute.POST(
      req("/api/configs", {
        method: "POST",
        user: A,
        body: { configName: "novo", creatorsCategory: "fit", userId: B.id, id: MISSING_UUID },
      })
    );
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.configName).toBe("novo");
    expect(created.id).not.toBe(MISSING_UUID);
    const [row] = await db.select().from(configs).where(eq(configs.id, created.id));
    expect(row.userId).toBe(A.id);

    const dup = await configsRoute.POST(
      req("/api/configs", { method: "POST", user: A, body: { configName: "novo" } })
    );
    expect(dup.status).toBe(409);
  });

  it("POST with an invalid body is 400", async () => {
    const res = await configsRoute.POST(
      req("/api/configs", { method: "POST", user: A, body: { configName: "" } })
    );
    expect(res.status).toBe(400);
    const bad = await configsRoute.POST(
      req("/api/configs", { method: "POST", user: A, rawBody: "{not json" })
    );
    expect(bad.status).toBe(400);
  });

  it("PUT ignores userId in the body and only changes valid fields", async () => {
    const res = await configsRoute.PUT(
      req("/api/configs", {
        method: "PUT",
        user: A,
        body: { id: cfgA.id, configName: "renomeado", userId: B.id, bogus: 1 },
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ id: cfgA.id, configName: "renomeado", creatorsCategory: "fit" });
    expect(body.bogus).toBeUndefined();
    const [row] = await db.select().from(configs).where(eq(configs.id, cfgA.id));
    expect(row.userId).toBe(A.id);
    expect(row.configName).toBe("renomeado");
  });

  it("PUT on another account's config is 404 and leaves it alone", async () => {
    const res = await configsRoute.PUT(
      req("/api/configs", { method: "PUT", user: A, body: { id: cfgB.id, configName: "hack" } })
    );
    expect(res.status).toBe(404);
    const [row] = await db.select().from(configs).where(eq(configs.id, cfgB.id));
    expect(row.configName).toBe("cfg-b");
  });

  it("PUT with an invalid id is 400", async () => {
    const res = await configsRoute.PUT(
      req("/api/configs", { method: "PUT", user: A, body: { id: "nope", configName: "x" } })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "id inválido" });
  });

  it("PUT renaming onto an existing name is 409", async () => {
    const other = ok(await createConfig(A.id, { configName: "outro" }));
    const res = await configsRoute.PUT(
      req("/api/configs", { method: "PUT", user: A, body: { id: other.id, configName: "cfg" } })
    );
    expect(res.status).toBe(409);
  });

  it("DELETE of another account's config is 404", async () => {
    const res = await configsRoute.DELETE(
      req(`/api/configs?id=${cfgB.id}`, { method: "DELETE", user: A })
    );
    expect(res.status).toBe(404);
    expect(await db.select().from(configs).where(eq(configs.id, cfgB.id))).toHaveLength(1);
  });

  it("DELETE of own config succeeds; invalid id is 400", async () => {
    const res = await configsRoute.DELETE(
      req(`/api/configs?id=${cfgA.id}`, { method: "DELETE", user: A })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    const bad = await configsRoute.DELETE(req(`/api/configs?id=xyz`, { method: "DELETE", user: A }));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "id inválido" });
  });

  it("admin writes on another account are audited", async () => {
    const put = await configsRoute.PUT(
      req(`/api/configs?userId=${B.id}`, {
        method: "PUT",
        user: admin,
        body: { id: cfgB.id, analysisInstruction: "nova" },
      })
    );
    expect(put.status).toBe(200);
    const post = await configsRoute.POST(
      req(`/api/configs?userId=${B.id}`, { method: "POST", user: admin, body: { configName: "z" } })
    );
    expect(post.status).toBe(201);
    const del = await configsRoute.DELETE(
      req(`/api/configs?id=${cfgB.id}&userId=${B.id}`, { method: "DELETE", user: admin })
    );
    expect(del.status).toBe(200);
    const rows = await db.select().from(adminAudit);
    expect(rows.map((r) => r.action).sort()).toEqual(["create", "delete", "update"]);
    expect(rows.every((r) => r.adminId === admin.id && r.targetUserId === B.id)).toBe(true);
  });

  it("admin write to an unknown user is 404 with no write and no audit", async () => {
    const res = await configsRoute.POST(
      req(`/api/configs?userId=${MISSING_UUID}`, {
        method: "POST",
        user: admin,
        body: { configName: "fantasma" },
      })
    );
    expect(res.status).toBe(404);
    expect(await db.select().from(adminAudit)).toHaveLength(0);
    expect(await db.select().from(configs).where(eq(configs.configName, "fantasma"))).toHaveLength(0);
  });

  it("writes by a user on their own account are not audited", async () => {
    await configsRoute.POST(
      req(`/api/configs?userId=${A.id}`, { method: "POST", user: A, body: { configName: "self" } })
    );
    expect(await db.select().from(adminAudit)).toHaveLength(0);
  });
});

describe("/api/creators", () => {
  it("GET filters by category within the caller's account", async () => {
    await createCreator(A.id, { username: "carl", category: "food" });
    const res = await creatorsRoute.GET(req("/api/creators?category=fit", { user: A }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([
      {
        id: crA.id,
        username: "alice",
        category: "fit",
        profilePicUrl: "",
        followers: 0,
        reelsCount30d: 0,
        avgViews30d: 0,
        lastScrapedAt: "",
      },
    ]);
  });

  it("POST normalizes the username, scrapes stats, and 409s on a duplicate", async () => {
    const first = await creatorsRoute.POST(
      req("/api/creators", { method: "POST", user: A, body: { username: "@Marcel.Remus", category: "fit" } })
    );
    expect(first.status).toBe(201);
    const created = await first.json();
    expect(created).toMatchObject({ username: "marcel.remus", followers: 10, profilePicUrl: "pic-marcel.remus" });
    expect(created.lastScrapedAt).not.toBe("");
    expect(scraper.calls).toEqual(["marcel.remus"]);

    const second = await creatorsRoute.POST(
      req("/api/creators", { method: "POST", user: A, body: { username: "marcel.remus" } })
    );
    expect(second.status).toBe(409);
  });

  it("POST still returns 201 when scraping fails", async () => {
    scraper.fail = true;
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await creatorsRoute.POST(
      req("/api/creators", { method: "POST", user: A, body: { username: "zed" } })
    );
    errSpy.mockRestore();
    expect(res.status).toBe(201);
    expect((await res.json()).followers).toBe(0);
  });

  it("PUT on another account's creator is 404; own creator updates", async () => {
    const other = await creatorsRoute.PUT(
      req("/api/creators", { method: "PUT", user: A, body: { id: crB.id, category: "x" } })
    );
    expect(other.status).toBe(404);
    const mine = await creatorsRoute.PUT(
      req("/api/creators", {
        method: "PUT",
        user: A,
        body: { id: crA.id, username: "@Alice2", category: "food", userId: B.id, followers: 999 },
      })
    );
    expect(mine.status).toBe(200);
    expect(await mine.json()).toMatchObject({ username: "alice2", category: "food", followers: 0 });
  });

  it("DELETE of another account's creator is 404; invalid id is 400", async () => {
    const res = await creatorsRoute.DELETE(
      req(`/api/creators?id=${crB.id}`, { method: "DELETE", user: A })
    );
    expect(res.status).toBe(404);
    const bad = await creatorsRoute.DELETE(req(`/api/creators`, { method: "DELETE", user: A }));
    expect(bad.status).toBe(400);
    expect(await db.select().from(creators).where(eq(creators.id, crB.id))).toHaveLength(1);
  });
});

describe("/api/creators/refresh", () => {
  it("refreshes only the caller's creators and ignores ids from other accounts", async () => {
    const res = await refreshRoute.POST(
      req("/api/creators/refresh", { method: "POST", user: A, body: { ids: [crB.id] } })
    );
    expect(res.status).toBe(200);
    const events = await readStream(res);
    expect(events).toEqual([{ type: "complete" }]);
    expect(scraper.calls).toEqual([]);

    const all = await refreshRoute.POST(
      req("/api/creators/refresh", { method: "POST", user: A, body: { ids: [] } })
    );
    const allEvents = await readStream(all);
    expect(scraper.calls).toEqual(["alice"]);
    expect(allEvents.map((e) => e.type)).toEqual(["progress", "progress", "complete"]);
    const [rowA] = await db.select().from(creators).where(eq(creators.id, crA.id));
    expect(rowA.followers).toBe(10);
    const [rowB] = await db.select().from(creators).where(eq(creators.id, crB.id));
    expect(rowB.followers).toBe(0);
  });

  it("rejects invalid ids with 400", async () => {
    const res = await refreshRoute.POST(
      req("/api/creators/refresh", { method: "POST", user: A, body: { ids: ["nope"] } })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "id inválido" });
  });

  it("reports a generic error (no internal message) when scraping fails", async () => {
    scraper.fail = true;
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await refreshRoute.POST(
      req("/api/creators/refresh", { method: "POST", user: A, body: { ids: [] } })
    );
    const events = await readStream(res);
    errSpy.mockRestore();
    const error = events.find((e) => e.type === "error");
    expect(error).toMatchObject({ username: "alice" });
    expect(String(error!.error)).not.toContain("scrape failed");
    expect(events.at(-1)).toEqual({ type: "complete" });
  });

  it("does not report done for a creator deleted while it was being scraped", async () => {
    scraper.beforeReturn = async () => {
      await db.delete(creators).where(eq(creators.id, crA.id));
    };
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await refreshRoute.POST(
      req("/api/creators/refresh", { method: "POST", user: A, body: { ids: [] } })
    );
    const events = await readStream(res);
    errSpy.mockRestore();
    expect(events.some((e) => e.status === "done")).toBe(false);
    expect(events.find((e) => e.type === "error")).toMatchObject({ username: "alice" });
    expect(events.at(-1)).toEqual({ type: "complete" });
  });

  it("admin refresh of another account is audited", async () => {
    const res = await refreshRoute.POST(
      req(`/api/creators/refresh?userId=${B.id}`, { method: "POST", user: admin, body: { ids: [] } })
    );
    await readStream(res);
    expect(scraper.calls).toEqual(["bob"]);
    const rows = await db.select().from(adminAudit);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "update", adminId: admin.id, targetUserId: B.id });
  });
});

describe("/api/videos", () => {
  it("GET returns the caller's videos in the legacy shape", async () => {
    const res = await videosRoute.GET(req("/api/videos", { user: A }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      {
        id: vidA.id,
        link: "",
        thumbnail: "",
        creator: "alice",
        views: 5,
        likes: 0,
        comments: 0,
        analysis: "",
        newConcepts: "",
        datePosted: "2026-10-01",
        dateAdded: "2026-10-02",
        configName: "cfg",
        starred: false,
      },
    ]);
    const filtered = await videosRoute.GET(req("/api/videos?creator=bob", { user: A }));
    expect(await filtered.json()).toEqual([]);
  });

  it("PATCH of another account's video is 404", async () => {
    const res = await videosRoute.PATCH(
      req("/api/videos", { method: "PATCH", user: A, body: { id: vidB.id, starred: true } })
    );
    expect(res.status).toBe(404);
    const [row] = await db.select().from(videos).where(eq(videos.id, vidB.id));
    expect(row.starred).toBe(false);
  });

  it("PATCH stars own video; invalid id is 400", async () => {
    const res = await videosRoute.PATCH(
      req("/api/videos", { method: "PATCH", user: A, body: { id: vidA.id, starred: true } })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).starred).toBe(true);
    const bad = await videosRoute.PATCH(
      req("/api/videos", { method: "PATCH", user: A, body: { id: "x", starred: true } })
    );
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "id inválido" });
  });
});

describe("text and input limits", () => {
  const long = (n: number) => "x".repeat(n);

  it("config name and category accept 200 chars and reject 201 (POST and PUT)", async () => {
    const okRes = await configsRoute.POST(
      req("/api/configs", {
        method: "POST",
        user: A,
        body: { configName: long(200), creatorsCategory: long(200) },
      })
    );
    expect(okRes.status).toBe(201);
    for (const body of [{ configName: long(201) }, { configName: "n", creatorsCategory: long(201) }]) {
      const res = await configsRoute.POST(req("/api/configs", { method: "POST", user: A, body }));
      expect(res.status).toBe(400);
    }
    const put = await configsRoute.PUT(
      req("/api/configs", { method: "PUT", user: A, body: { id: cfgA.id, configName: long(201) } })
    );
    expect(put.status).toBe(400);
  });

  it("both instructions accept 20000 chars and reject 20001 (POST and PUT)", async () => {
    const okRes = await configsRoute.POST(
      req("/api/configs", {
        method: "POST",
        user: A,
        body: { configName: "big", analysisInstruction: long(20000), newConceptsInstruction: long(20000) },
      })
    );
    expect(okRes.status).toBe(201);
    for (const field of ["analysisInstruction", "newConceptsInstruction"]) {
      const post = await configsRoute.POST(
        req("/api/configs", { method: "POST", user: A, body: { configName: `c-${field}`, [field]: long(20001) } })
      );
      expect(post.status).toBe(400);
      const put = await configsRoute.PUT(
        req("/api/configs", { method: "PUT", user: A, body: { id: cfgA.id, [field]: long(20001) } })
      );
      expect(put.status).toBe(400);
    }
    const [row] = await db.select().from(configs).where(eq(configs.id, cfgA.id));
    expect(row.analysisInstruction ?? "").toHaveLength(0);
  });

  it("creator category accepts 200 chars and rejects 201", async () => {
    const put = await creatorsRoute.PUT(
      req("/api/creators", { method: "PUT", user: A, body: { id: crA.id, category: long(201) } })
    );
    expect(put.status).toBe(400);
    const post = await creatorsRoute.POST(
      req("/api/creators", { method: "POST", user: A, body: { username: "newone", category: long(201) } })
    );
    expect(post.status).toBe(400);
    const okPut = await creatorsRoute.PUT(
      req("/api/creators", { method: "PUT", user: A, body: { id: crA.id, category: long(200) } })
    );
    expect(okPut.status).toBe(200);
  });

  it("invalid usernames are 400 'usuário inválido' on create and update, with no scrape", async () => {
    for (const username of ["", "@", "a b", "joão", "x/../y", "a?b=c", long(31), "<script>"]) {
      const post = await creatorsRoute.POST(
        req("/api/creators", { method: "POST", user: A, body: { username } })
      );
      expect(post.status, username).toBe(400);
      expect(await post.json()).toEqual({ error: "usuário inválido" });
      const put = await creatorsRoute.PUT(
        req("/api/creators", { method: "PUT", user: A, body: { id: crA.id, username } })
      );
      expect(put.status, username).toBe(400);
      expect(await put.json()).toEqual({ error: "usuário inválido" });
    }
    expect(scraper.calls).toEqual([]);
    const [row] = await db.select().from(creators).where(eq(creators.id, crA.id));
    expect(row.username).toBe("alice");
  });

  it("a 30-char handle with dots and underscores is accepted after normalization", async () => {
    const handle = `a._${"b".repeat(27)}`;
    const res = await creatorsRoute.POST(
      req("/api/creators", { method: "POST", user: A, body: { username: ` @${handle.toUpperCase()} ` } })
    );
    expect(res.status).toBe(201);
    expect((await res.json()).username).toBe(handle);
  });
});

describe("Apify spend control", () => {
  it("POST beyond 50 creators per account is 422 and makes no scrape", async () => {
    // A already has 1 creator (alice); fill up to 50.
    await db
      .insert(creators)
      .values(Array.from({ length: 49 }, (_, i) => ({ userId: A.id, username: `filler${i}` })));
    scraper.calls = [];
    const res = await creatorsRoute.POST(
      req("/api/creators", { method: "POST", user: A, body: { username: "onetoomany" } })
    );
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "Limite de 50 criadores por conta atingido" });
    expect(scraper.calls).toEqual([]);
    expect(await db.select().from(creators).where(eq(creators.userId, A.id))).toHaveLength(50);
    // The limit is per account: B can still add.
    const other = await creatorsRoute.POST(
      req("/api/creators", { method: "POST", user: B, body: { username: "onetoomany" } })
    );
    expect(other.status).toBe(201);
  });

  it("concurrent creates cannot exceed the limit", async () => {
    await db
      .insert(creators)
      .values(Array.from({ length: 48 }, (_, i) => ({ userId: A.id, username: `filler${i}` })));
    const results = await Promise.all(
      ["p1", "p2", "p3", "p4"].map((username) =>
        createCreator(A.id, { username })
      )
    );
    expect(results.filter((r) => !("error" in r))).toHaveLength(1);
    expect(results.filter((r) => "error" in r && r.error === "limit")).toHaveLength(3);
    expect(await db.select().from(creators).where(eq(creators.userId, A.id))).toHaveLength(50);
  });

  it("refresh skips a creator scraped less than 10 minutes ago and scrapes an old one", async () => {
    const recent = ok(await createCreator(A.id, { username: "recent" }));
    await db
      .update(creators)
      .set({ lastScrapedAt: new Date(Date.now() - 5 * 60 * 1000) })
      .where(eq(creators.id, recent.id));
    await db
      .update(creators)
      .set({ lastScrapedAt: new Date(Date.now() - 11 * 60 * 1000) })
      .where(eq(creators.id, crA.id));

    const res = await refreshRoute.POST(
      req("/api/creators/refresh", { method: "POST", user: A, body: { ids: [] } })
    );
    const events = await readStream(res);
    expect(scraper.calls).toEqual(["alice"]);
    expect(events.find((e) => e.username === "recent")).toMatchObject({
      type: "progress",
      status: "skipped",
    });
    expect(events.some((e) => e.username === "recent" && e.status !== "skipped")).toBe(false);
    expect(events.find((e) => e.username === "alice" && e.status === "done")).toBeTruthy();
    expect(events.at(-1)).toEqual({ type: "complete" });

    // Asking for the recent one explicitly still makes no scraper call.
    scraper.calls = [];
    const one = await refreshRoute.POST(
      req("/api/creators/refresh", { method: "POST", user: A, body: { ids: [recent.id] } })
    );
    await readStream(one);
    expect(scraper.calls).toEqual([]);
  });
});
