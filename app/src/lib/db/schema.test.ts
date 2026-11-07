import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "./index";
import { configs, users } from "./schema";
import { resetDb } from "@/test/db";

describe("schema", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function insertUser() {
    const [u] = await db
      .insert(users)
      .values({ email: "a@b.com", name: "A", passwordHash: "x", role: "user" })
      .returning();
    return u;
  }

  it("rejects duplicate (userId, configName)", async () => {
    const u = await insertUser();
    await db.insert(configs).values({ userId: u.id, configName: "c1" });
    await expect(
      db.insert(configs).values({ userId: u.id, configName: "c1" })
    ).rejects.toThrow();
  });

  it("cascades config deletion when the user is deleted", async () => {
    const u = await insertUser();
    await db.insert(configs).values({ userId: u.id, configName: "c1" });
    await db.delete(users).where(eq(users.id, u.id));
    const rows = await db.select().from(configs);
    expect(rows).toHaveLength(0);
  });
});
