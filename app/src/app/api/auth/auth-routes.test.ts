import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { sessions, usageDaily, users } from "@/lib/db/schema";
import { todayInSaoPaulo } from "@/lib/quota/day";
import { resetDb } from "@/test/db";
import { hashPassword } from "@/lib/auth/password";
import { requireAdmin } from "@/lib/auth/require-session";
import { POST as logout } from "./logout/route";

const hashControl = vi.hoisted(() => ({ failNext: false }));
vi.mock("@/lib/auth/password", async (orig) => {
  const actual = await orig<typeof import("@/lib/auth/password")>();
  return {
    ...actual,
    hashPassword: async (pw: string) => {
      if (hashControl.failNext) {
        hashControl.failNext = false;
        throw new Error("hash failed");
      }
      return actual.hashPassword(pw);
    },
  };
});
import { POST as login } from "./login/route";
import { GET as me } from "./me/route";

let ipCounter = 0;
function loginReq(email: string, password: string, ip = `10.0.0.${++ipCounter}`) {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ email, password }),
  });
}

async function mkUser(email: string, active = true) {
  await db.insert(users).values({
    email,
    name: "Ana",
    passwordHash: await hashPassword("senha-certa-1"),
    role: "user",
    active,
  });
}

describe("auth routes", () => {
  beforeEach(async () => {
    hashControl.failNext = false;
    await resetDb();
  });

  it("logs in with the right password and sets an HttpOnly session cookie", async () => {
    await mkUser("ana1@x.com");
    const res = await login(loginReq("ana1@x.com", "senha-certa-1"));
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("sm_session=");
    expect(cookie).toContain("HttpOnly");
    const body = await res.json();
    expect(body).toMatchObject({ email: "ana1@x.com", name: "Ana", role: "user" });
    expect(body.passwordHash).toBeUndefined();
  });

  it("rejects a wrong password with the generic message", async () => {
    await mkUser("ana2@x.com");
    const res = await login(loginReq("ana2@x.com", "errada"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "E-mail ou senha inválidos" });
  });

  it("normalizes e-mail case and surrounding spaces", async () => {
    await mkUser("ana3@x.com");
    const res = await login(loginReq("  Ana3@X.com ", "senha-certa-1"));
    expect(res.status).toBe(200);
  });

  it("returns 429 with Retry-After on the 6th attempt for the same e-mail", async () => {
    await mkUser("ana4@x.com");
    for (let i = 0; i < 5; i++) {
      const r = await login(loginReq("ana4@x.com", "errada"));
      expect(r.status).toBe(401);
    }
    const res = await login(loginReq("ana4@x.com", "senha-certa-1"));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("returns 429 on the 6th attempt from the same IP across different e-mails", async () => {
    for (let i = 0; i < 5; i++) {
      await login(loginReq(`nobody${i}@x.com`, "x", "9.9.9.9"));
    }
    const res = await login(loginReq("nobody-other@x.com", "x", "9.9.9.9"));
    expect(res.status).toBe(429);
  });

  it("treats an inactive account with the right password like any failure", async () => {
    await mkUser("ana5@x.com", false);
    const res = await login(loginReq("ana5@x.com", "senha-certa-1"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "E-mail ou senha inválidos" });
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("me returns the user for a valid cookie", async () => {
    await mkUser("ana6@x.com");
    const res = await login(loginReq("ana6@x.com", "senha-certa-1"));
    const token = /sm_session=([^;]+)/.exec(res.headers.get("set-cookie") ?? "")![1];
    const r = await me(
      new Request("http://localhost/api/auth/me", { headers: { cookie: `sm_session=${token}` } })
    );
    expect(r.status).toBe(200);
    expect((await r.json()).email).toBe("ana6@x.com");
  });

  it("me returns the limits and today's usage", async () => {
    await mkUser("quota@x.com");
    const res = await login(loginReq("quota@x.com", "senha-certa-1"));
    const token = /sm_session=([^;]+)/.exec(res.headers.get("set-cookie") ?? "")![1];
    const req = () =>
      new Request("http://localhost/api/auth/me", { headers: { cookie: `sm_session=${token}` } });

    const fresh = await (await me(req())).json();
    expect(fresh.usageToday).toEqual({ runs: 0, videos: 0 });
    expect(typeof fresh.dailyRunsLimit).toBe("number");
    expect(typeof fresh.dailyVideosLimit).toBe("number");

    const [u] = await db.select({ id: users.id }).from(users);
    await db.insert(usageDaily).values({ userId: u.id, day: todayInSaoPaulo(), runs: 2, videos: 7 });
    const used = await (await me(req())).json();
    expect(used.usageToday).toEqual({ runs: 2, videos: 7 });
    expect(used.passwordHash).toBeUndefined();
  });

  it("me with a tampered cookie returns 401 and expires the cookie", async () => {
    const res = await me(
      new Request("http://localhost/api/auth/me", { headers: { cookie: "sm_session=tampered" } })
    );
    expect(res.status).toBe(401);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("sm_session=;");
    expect(cookie).toContain("Max-Age=0");
  });

  it("rate-limits by the last X-Forwarded-For hop even if the first hop changes", async () => {
    for (let i = 0; i < 5; i++) {
      await login(loginReq(`spoof${i}@x.com`, "x", `1.1.1.${i}, 8.8.8.8`));
    }
    const res = await login(loginReq("spoof-other@x.com", "x", "2.2.2.2, 8.8.8.8"));
    expect(res.status).toBe(429);
  });

  it("rejects non-JSON content types with 415", async () => {
    await mkUser("ct@x.com");
    const res = await login(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "content-type": "text/plain", "x-forwarded-for": "10.9.9.1" },
        body: JSON.stringify({ email: "ct@x.com", password: "senha-certa-1" }),
      })
    );
    expect(res.status).toBe(415);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("returns 401 for malformed JSON and for missing fields", async () => {
    const bad = await login(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "10.9.9.2" },
        body: "{not json",
      })
    );
    expect(bad.status).toBe(401);
    const missing = await login(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "10.9.9.3" },
        body: JSON.stringify({ email: "a@b.com" }),
      })
    );
    expect(missing.status).toBe(401);
    expect(await missing.json()).toEqual({ error: "E-mail ou senha inválidos" });
  });

  it("a failed dummy hash is not cached for later unknown-email logins", async () => {
    // Fresh module instance so the module-level dummy hash cache starts empty.
    vi.resetModules();
    const { POST: freshLogin } = await import("./login/route");
    hashControl.failNext = true;
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const failed = await freshLogin(loginReq("ghost1@x.com", "x"));
    errSpy.mockRestore();
    // Unexpected errors become a generic 500: the internal message never reaches the body.
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: "Erro interno" });
    const res = await freshLogin(loginReq("ghost2@x.com", "x"));
    expect(res.status).toBe(401);
  });

  it("logout deletes the session row and clears the cookie", async () => {
    await mkUser("out@x.com");
    const res = await login(loginReq("out@x.com", "senha-certa-1"));
    const token = /sm_session=([^;]+)/.exec(res.headers.get("set-cookie") ?? "")![1];
    expect((await db.select().from(sessions)).length).toBe(1);
    const out = await logout(
      new Request("http://localhost/api/auth/logout", {
        method: "POST",
        headers: { cookie: `sm_session=${token}` },
      })
    );
    expect(out.status).toBe(200);
    expect(out.headers.get("set-cookie")).toContain("Max-Age=0");
    expect((await db.select().from(sessions)).length).toBe(0);
    const after = await me(
      new Request("http://localhost/api/auth/me", { headers: { cookie: `sm_session=${token}` } })
    );
    expect(after.status).toBe(401);
  });

  it("requireAdmin returns 403 for a regular user and 401 without a session", async () => {
    await mkUser("reg@x.com");
    const res = await login(loginReq("reg@x.com", "senha-certa-1"));
    const token = /sm_session=([^;]+)/.exec(res.headers.get("set-cookie") ?? "")![1];
    const r = await requireAdmin(
      new Request("http://localhost/x", { headers: { cookie: `sm_session=${token}` } })
    );
    expect("response" in r && r.response.status).toBe(403);
    const anon = await requireAdmin(new Request("http://localhost/x"));
    expect("response" in anon && anon.response.status).toBe(401);
  });
});
