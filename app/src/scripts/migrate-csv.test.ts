import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { configs, creators, videos } from "@/lib/db/schema";
import { resetDb } from "@/test/db";
import { createUser } from "./account";
import { migrateCsv } from "./migrate-csv";

const dataDir = path.join(__dirname, "__fixtures__");
const ownerEmail = "owner@x.com";

beforeEach(async () => {
  await resetDb();
  await createUser({ email: ownerEmail, name: "Owner", password: "password1", role: "admin" });
});

describe("migrateCsv", () => {
  it("imports fixtures into the owner account, preserving ids and counting orphans", async () => {
    const res = await migrateCsv({ dataDir, ownerEmail });
    expect(res).toEqual({ configs: 2, creators: 2, videos: 3, orphanVideos: 1 });

    expect((await db.select().from(configs)).map((c) => c.id).sort()).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ]);
    const vids = await db.select().from(videos);
    const byId = new Map(vids.map((v) => [v.id, v]));
    const v1 = byId.get("c0000001-0000-4000-8000-000000000001")!;
    expect(v1.creatorId).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(v1.configId).toBe("11111111-1111-4111-8111-111111111111");
    expect(v1.starred).toBe(true);
    expect(v1.views).toBe(100);
    expect(v1.analysis).toBe("analysis, one");
    // Config name not found -> configId null, name preserved.
    const v2 = byId.get("c0000002-0000-4000-8000-000000000002")!;
    expect(v2.configId).toBeNull();
    expect(v2.configName).toBe("MISSING_CFG");
    // Orphan: creator not in creators.csv.
    const v3 = byId.get("c0000003-0000-4000-8000-000000000003")!;
    expect(v3.creatorId).toBeNull();
    expect(v3.creatorUsername).toBe("ghost");
    expect(v3.datePosted).toBeNull();
  });

  it("is idempotent: a second run adds nothing", async () => {
    await migrateCsv({ dataDir, ownerEmail });
    const second = await migrateCsv({ dataDir, ownerEmail });
    expect(second).toEqual({ configs: 2, creators: 2, videos: 3, orphanVideos: 1 });
    expect(await db.select().from(configs)).toHaveLength(2);
    expect(await db.select().from(creators)).toHaveLength(2);
    expect(await db.select().from(videos)).toHaveLength(3);
  });

  it("fails with a clear error when the owner does not exist", async () => {
    await expect(migrateCsv({ dataDir, ownerEmail: "nobody@x.com" })).rejects.toThrow("owner not found");
    expect(await db.select().from(videos)).toHaveLength(0);
  });
});
