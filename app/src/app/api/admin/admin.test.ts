import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { adminAudit, pipelineRuns, sessions, usageDaily, users } from "@/lib/db/schema";
import { resetDb } from "@/test/db";
import { createSession } from "@/lib/auth/session";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { hashPassword } from "@/lib/auth/password";
import { todayInSaoPaulo } from "@/lib/quota/day";
import { GET, PATCH } from "./users/route";
import { GET as getRuns } from "./runs/route";
import { POST as login } from "../auth/login/route";

type U = { id: string; cookie: string };

async function mkUser(email: string, role: "admin" | "user" = "user"): Promise<U> {
  const [u] = await db
    .insert(users)
    .values({ email, name: email, passwordHash: await hashPassword("senha-certa-1"), role })
    .returning();
  const { token } = await createSession(u.id);
  return { id: u.id, cookie: `${SESSION_COOKIE}=${token}` };
}

function req(method: string, user?: U, body?: unknown): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (user) headers.cookie = user.cookie;
  return new Request("http://localhost/api/admin/users", {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

let admin: U, A: U, B: U;

beforeEach(async () => {
  await resetDb();
  admin = await mkUser("admin@x.com", "admin");
  A = await mkUser("a@x.com");
  B = await mkUser("b@x.com");
});

describe("GET /api/admin/users", () => {
  it("rejects anonymous (401) and regular users (403)", async () => {
    expect((await GET(req("GET"))).status).toBe(401);
    expect((await GET(req("GET", A))).status).toBe(403);
  });

  it("lists users with today's usage as plain numbers", async () => {
    await db.insert(usageDaily).values({ userId: B.id, day: todayInSaoPaulo(), runs: 2, videos: 7 });
    const res = await GET(req("GET", admin));
    expect(res.status).toBe(200);
    const list = (await res.json()) as Array<Record<string, unknown>>;
    expect(list.map((u) => u.email).sort()).toEqual(["a@x.com", "admin@x.com", "b@x.com"]);
    const b = list.find((u) => u.email === "b@x.com")!;
    expect(b.usageToday).toEqual({ runs: 2, videos: 7 });
    expect(b.dailyRunsLimit).toBe(5);
    expect(typeof b.dailyVideosLimit).toBe("number");
    expect(b).not.toHaveProperty("passwordHash");
    expect(list.find((u) => u.email === "a@x.com")!.usageToday).toEqual({ runs: 0, videos: 0 });
  });
});

describe("PATCH /api/admin/users", () => {
  it("rejects anonymous requests with 401 and changes nothing", async () => {
    const res = await PATCH(req("PATCH", undefined, { id: B.id, dailyRunsLimit: 1 }));
    expect(res.status).toBe(401);
    const [b] = await db.select().from(users).where(eq(users.id, B.id));
    expect(b.dailyRunsLimit).toBe(5);
  });

  it("rolls back the quota update when the audit insert fails (generic 500)", async () => {
    await db.execute(sql`create or replace function test_fail_audit() returns trigger as $$
      begin raise exception 'audit boom'; end $$ language plpgsql`);
    await db.execute(sql`create trigger test_fail_audit before insert on admin_audit
      for each row execute function test_fail_audit()`);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await PATCH(req("PATCH", admin, { id: B.id, dailyRunsLimit: 1 }));
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "Erro interno" });
    } finally {
      errSpy.mockRestore();
      await db.execute(sql`drop trigger if exists test_fail_audit on admin_audit`);
      await db.execute(sql`drop function if exists test_fail_audit()`);
    }
    const [b] = await db.select().from(users).where(eq(users.id, B.id));
    expect(b.dailyRunsLimit).toBe(5);
    expect(await db.select().from(adminAudit)).toHaveLength(0);
  });

  it("rejects regular users with 403 and changes nothing", async () => {
    const res = await PATCH(req("PATCH", A, { id: B.id, dailyRunsLimit: 1 }));
    expect(res.status).toBe(403);
    const [b] = await db.select().from(users).where(eq(users.id, B.id));
    expect(b.dailyRunsLimit).toBe(5);
  });

  it("updates a quota and writes a quota_update audit row with previous/new", async () => {
    const res = await PATCH(req("PATCH", admin, { id: B.id, dailyRunsLimit: 2 }));
    expect(res.status).toBe(200);
    const [b] = await db.select().from(users).where(eq(users.id, B.id));
    expect(b.dailyRunsLimit).toBe(2);
    const rows = await db.select().from(adminAudit).where(eq(adminAudit.targetUserId, B.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("quota_update");
    expect(rows[0].adminId).toBe(admin.id);
    expect(rows[0].detail).toEqual({ previous: { dailyRunsLimit: 5 }, new: { dailyRunsLimit: 2 } });
  });

  it("writes no audit row when nothing actually changes", async () => {
    const res = await PATCH(req("PATCH", admin, { id: B.id, dailyRunsLimit: 5 }));
    expect(res.status).toBe(200);
    expect(await db.select().from(adminAudit)).toHaveLength(0);
  });

  it("rejects out-of-range, non-integer, unknown and empty bodies with 400", async () => {
    for (const body of [
      { id: B.id, dailyRunsLimit: -1 },
      { id: B.id, dailyVideosLimit: 10001 },
      { id: B.id, dailyRunsLimit: 1.5 },
      { id: B.id, dailyRunsLimit: "3" },
      { id: B.id, active: "no" },
      { id: B.id, role: "admin" },
      { id: B.id },
      { id: "nope", dailyRunsLimit: 1 },
    ]) {
      expect((await PATCH(req("PATCH", admin, body))).status).toBe(400);
    }
    expect(await db.select().from(adminAudit)).toHaveLength(0);
  });

  it("returns 404 for an unknown user", async () => {
    const res = await PATCH(
      req("PATCH", admin, { id: "00000000-0000-4000-8000-000000000000", dailyRunsLimit: 1 })
    );
    expect(res.status).toBe(404);
  });

  it("refuses to deactivate the admin's own account (400)", async () => {
    const res = await PATCH(req("PATCH", admin, { id: admin.id, active: false }));
    expect(res.status).toBe(400);
    const [a] = await db.select().from(users).where(eq(users.id, admin.id));
    expect(a.active).toBe(true);
    expect(await db.select().from(adminAudit)).toHaveLength(0);
  });

  it("deactivating B writes set_active audit, kills B's session and blocks login generically", async () => {
    const res = await PATCH(req("PATCH", admin, { id: B.id, active: false }));
    expect(res.status).toBe(200);
    const rows = await db.select().from(adminAudit).where(eq(adminAudit.targetUserId, B.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("set_active");
    expect(rows[0].detail).toEqual({ previous: true, new: false });
    expect(await db.select().from(sessions).where(eq(sessions.userId, B.id))).toHaveLength(0);
    expect(await db.select().from(sessions).where(eq(sessions.userId, A.id))).toHaveLength(1);

    expect((await GET(req("GET", B))).status).toBe(401);

    const loginRes = await login(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "10.9.9.9" },
        body: JSON.stringify({ email: "b@x.com", password: "senha-certa-1" }),
      })
    );
    expect(loginRes.status).toBe(401);
    expect(await loginRes.json()).toEqual({ error: "E-mail ou senha inválidos" });
  });
});

describe("GET /api/admin/runs", () => {
  function runsReq(user: U | undefined, userId: string): Request {
    const headers: Record<string, string> = {};
    if (user) headers.cookie = user.cookie;
    return new Request(`http://localhost/api/admin/runs?userId=${encodeURIComponent(userId)}`, { headers });
  }

  it("lists another account's runs, newest first, without the log", async () => {
    await db.insert(pipelineRuns).values([
      {
        userId: B.id,
        status: "failed",
        params: { configName: "c", maxVideos: 5, topK: 2, nDays: 7 },
        startedAt: new Date("2026-11-01T10:00:00Z"),
        finishedAt: new Date("2026-11-01T10:05:00Z"),
        log: ["raw upstream error: secret"],
      },
      { userId: B.id, status: "done", startedAt: new Date("2026-11-02T10:00:00Z") },
      { userId: A.id, status: "done" },
    ]);
    const res = await getRuns(runsReq(admin, B.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body.map((r: { status: string }) => r.status)).toEqual(["done", "failed"]);
    expect(body[1]).toEqual({
      id: expect.any(String),
      status: "failed",
      startedAt: "2026-11-01T10:00:00.000Z",
      finishedAt: "2026-11-01T10:05:00.000Z",
      params: { configName: "c", maxVideos: 5, topK: 2, nDays: 7 },
    });
    expect(JSON.stringify(body)).not.toContain("secret");
  });

  it("caps the list at 50 rows", async () => {
    await db
      .insert(pipelineRuns)
      .values(Array.from({ length: 55 }, () => ({ userId: B.id, status: "done" as const })));
    const body = await (await getRuns(runsReq(admin, B.id))).json();
    expect(body).toHaveLength(50);
  });

  it("is 401 without a session and 403 for a regular user", async () => {
    expect((await getRuns(runsReq(undefined, B.id))).status).toBe(401);
    expect((await getRuns(runsReq(A, B.id))).status).toBe(403);
    expect((await getRuns(runsReq(A, A.id))).status).toBe(403);
  });

  it("is 400 for an invalid userId and 404 for an unknown one", async () => {
    expect((await getRuns(runsReq(admin, "not-a-uuid"))).status).toBe(400);
    expect((await getRuns(runsReq(admin, ""))).status).toBe(400);
    expect((await getRuns(runsReq(admin, "00000000-0000-4000-8000-000000000000"))).status).toBe(404);
  });
});
