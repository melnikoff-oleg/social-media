import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { adminAudit, configs, sessions, users } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, getSessionUser } from "@/lib/auth/session";
import { resetDb } from "@/test/db";
import { createUser, deleteUser, resetPassword, setActive } from "./account";

beforeEach(async () => {
  await resetDb();
});

const base = { name: "Ana", password: "password1", role: "user" as const };

describe("createUser", () => {
  it("normalizes the email and rejects a duplicate in another case", async () => {
    const u = await createUser({ ...base, email: "  ana@x.com " });
    expect(u.email).toBe("ana@x.com");
    await expect(createUser({ ...base, email: "ANA@x.com" })).rejects.toThrow(
      "email already exists"
    );
  });

  it("rejects an invalid role", async () => {
    await expect(
      createUser({ ...base, email: "a@x.com", role: "root" as never })
    ).rejects.toThrow();
  });

  it("rejects a short password", async () => {
    await expect(
      createUser({ ...base, email: "a@x.com", password: "short" })
    ).rejects.toThrow();
  });
});

describe("resetPassword", () => {
  it("deletes only that user's sessions", async () => {
    const u = await createUser({ ...base, email: "ana@x.com" });
    const other = await createUser({ ...base, email: "bia@x.com" });
    const { token } = await createSession(u.id);
    await createSession(u.id);
    const { token: otherToken } = await createSession(other.id);
    await resetPassword("ana@x.com", "newpassword2");
    expect(await db.select().from(sessions).where(eq(sessions.userId, u.id))).toHaveLength(0);
    expect(await getSessionUser(token)).toBeNull();
    expect(await getSessionUser(otherToken)).not.toBeNull();
  });

  it("keeps sessions when the password is rejected", async () => {
    const u = await createUser({ ...base, email: "ana@x.com" });
    const { token } = await createSession(u.id);
    await expect(resetPassword("ana@x.com", "short")).rejects.toThrow();
    expect(await getSessionUser(token)).not.toBeNull();
  });

  it("replaces the hash", async () => {
    const u = await createUser({ ...base, email: "ana@x.com" });
    await resetPassword("ANA@x.com", "newpassword2");
    const [row] = await db.select().from(users).where(eq(users.id, u.id));
    expect(await verifyPassword(row.passwordHash, "newpassword2")).toBe(true);
    expect(await verifyPassword(row.passwordHash, "password1")).toBe(false);
  });

  it("throws for an unknown user and a short password", async () => {
    await expect(resetPassword("no@x.com", "newpassword2")).rejects.toThrow(
      "user not found"
    );
    await createUser({ ...base, email: "ana@x.com" });
    await expect(resetPassword("ana@x.com", "short")).rejects.toThrow();
  });
});

describe("setActive", () => {
  it("disabling a user deletes their sessions; re-enabling does not bring them back", async () => {
    const u = await createUser({ ...base, email: "ana@x.com" });
    const other = await createUser({ ...base, email: "bia@x.com" });
    const { token } = await createSession(u.id);
    const { token: otherToken } = await createSession(other.id);
    expect(await getSessionUser(token)).not.toBeNull();
    await setActive("ana@x.com", false);
    expect(await db.select().from(sessions).where(eq(sessions.userId, u.id))).toHaveLength(0);
    expect(await getSessionUser(token)).toBeNull();
    await setActive("ana@x.com", true);
    expect(await db.select().from(sessions).where(eq(sessions.userId, u.id))).toHaveLength(0);
    expect(await getSessionUser(token)).toBeNull();
    // Other users' sessions are untouched.
    expect(await getSessionUser(otherToken)).not.toBeNull();
  });

  it("enabling an active user keeps their sessions", async () => {
    const u = await createUser({ ...base, email: "ana@x.com" });
    const { token } = await createSession(u.id);
    await setActive("ana@x.com", true);
    expect(await getSessionUser(token)).not.toBeNull();
  });

  it("throws for an unknown user", async () => {
    await expect(setActive("no@x.com", false)).rejects.toThrow("user not found");
  });
});

describe("deleteUser", () => {
  it("removes sessions and configs by cascade", async () => {
    const u = await createUser({ ...base, email: "ana@x.com" });
    await createSession(u.id);
    await db.insert(configs).values({ userId: u.id, configName: "c" });
    await deleteUser("ana@x.com");
    expect(await db.select().from(users)).toHaveLength(0);
    expect(await db.select().from(sessions)).toHaveLength(0);
    expect(await db.select().from(configs)).toHaveLength(0);
  });

  it("refuses to delete an admin that has audit records", async () => {
    const admin = await createUser({ ...base, email: "adm@x.com", role: "admin" });
    const target = await createUser({ ...base, email: "t@x.com" });
    await db
      .insert(adminAudit)
      .values({ adminId: admin.id, targetUserId: target.id, action: "x" });
    await expect(deleteUser("adm@x.com")).rejects.toThrow(
      "admin has audit records; disable the account instead"
    );
    expect(await db.select().from(users).where(eq(users.id, admin.id))).toHaveLength(1);
  });

  it("throws for an unknown user", async () => {
    await expect(deleteUser("no@x.com")).rejects.toThrow("user not found");
  });
});
