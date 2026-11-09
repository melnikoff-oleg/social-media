import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";
import { resetDb } from "@/test/db";
import { normalizeEmail } from "./normalize";
import { hashPassword, verifyPassword } from "./password";
import { rateLimit } from "./rate-limit";
import { createSession, deleteSession, getSessionUser } from "./session";

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Ana@X.com ")).toBe("ana@x.com");
  });
});

describe("password", () => {
  it("verifies correct and rejects wrong password", async () => {
    const h = await hashPassword("abc12345");
    expect(h).toContain("argon2id");
    expect(await verifyPassword(h, "abc12345")).toBe(true);
    expect(await verifyPassword(h, "wrong")).toBe(false);
  });
  it("returns false for a malformed hash", async () => {
    expect(await verifyPassword("garbage", "x")).toBe(false);
  });
});

describe("rateLimit", () => {
  it("blocks the 6th call within the window and frees after it", () => {
    const t = 1_000_000;
    for (let i = 0; i < 5; i++) {
      expect(rateLimit("k1", 5, 60_000, t + i).allowed).toBe(true);
    }
    const blocked = rateLimit("k1", 5, 60_000, t + 10);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(rateLimit("k1", 5, 60_000, t + 60_001).allowed).toBe(true);
  });
  it("keeps keys independent", () => {
    for (let i = 0; i < 5; i++) rateLimit("a", 5, 1000, 1);
    expect(rateLimit("b", 5, 1000, 1).allowed).toBe(true);
  });
});

describe("sessions", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function mkUser(active = true) {
    const [u] = await db
      .insert(users)
      .values({ email: "a@b.com", name: "A", passwordHash: "x", role: "user", active })
      .returning();
    return u;
  }

  it("returns null for an unknown token", async () => {
    expect(await getSessionUser("nope")).toBeNull();
  });

  it("creates a session, stores only the hash, and resolves the user", async () => {
    const u = await mkUser();
    const { token, expiresAt } = await createSession(u.id);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    const rows = await db.select().from(sessions);
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).not.toBe(token);
    const su = await getSessionUser(token);
    expect(su).toEqual({
      id: u.id,
      email: "a@b.com",
      name: "A",
      role: "user",
      active: true,
      dailyRunsLimit: 5,
      dailyVideosLimit: 100,
    });
  });

  it("sets the session expiry to 7 days from now", async () => {
    const u = await mkUser();
    const { expiresAt } = await createSession(u.id);
    const expected = Date.now() + 7 * 24 * 60 * 60 * 1000;
    expect(Math.abs(expiresAt.getTime() - expected)).toBeLessThan(5000);
  });

  it("returns null for an expired session", async () => {
    const u = await mkUser();
    const { token } = await createSession(u.id);
    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await getSessionUser(token)).toBeNull();
  });

  it("returns null for an inactive user", async () => {
    const u = await mkUser();
    const { token } = await createSession(u.id);
    await db.update(users).set({ active: false }).where(eq(users.id, u.id));
    expect(await getSessionUser(token)).toBeNull();
  });

  it("deleteSession invalidates the token", async () => {
    const u = await mkUser();
    const { token } = await createSession(u.id);
    await deleteSession(token);
    expect(await getSessionUser(token)).toBeNull();
  });
});
