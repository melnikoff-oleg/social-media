import { Pool } from "pg";
import { runMigrations } from "@/lib/db/migrate";

// One small pool and one migration pass per test worker (each test file runs in
// its own forked worker), reused by every resetDb() call in that file.
//
// Do NOT go back to creating and ending a Pool inside every resetDb() call: that
// opened and closed two fresh Postgres connections before every test (~300 per
// suite), and on Windows that connect/close churn inside the Vitest fork worker
// intermittently killed the worker with a native abort (exit 0xC0000409), which
// Vitest reports as "Worker exited unexpectedly" and as missing/failed tests.
let resetPool: Pool | undefined;
let migrated: Promise<void> | undefined;

function getResetPool(url: string): Pool {
  if (!resetPool) {
    resetPool = new Pool({ connectionString: url, max: 1 });
    // An idle client dropped by the server must not crash the worker.
    resetPool.on("error", () => {});
  }
  return resetPool;
}

function migrateOnce(url: string): Promise<void> {
  if (!migrated) {
    migrated = runMigrations(url).catch((err) => {
      migrated = undefined; // let the next test retry instead of caching a failure
      throw err;
    });
  }
  return migrated;
}

/**
 * Resets the test database: applies the migrations (once per worker; creates the
 * schema on a fresh DB) and truncates every table in the public schema.
 *
 * Requires DATABASE_URL (vitest.config.mts maps it from TEST_DATABASE_URL).
 * Refuses to run unless the database name ends in "_test".
 */
export async function resetDb(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set: define TEST_DATABASE_URL for tests");
  }
  const dbName = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  if (!dbName.endsWith("_test")) {
    throw new Error(`resetDb refused: database "${dbName}" does not end in "_test"`);
  }
  await migrateOnce(url);
  const pool = getResetPool(url);
  const { rows } = await pool.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname = 'public' and tablename not like '\\_\\_drizzle%'"
  );
  if (rows.length > 0) {
    const names = rows
      .map((r) => `"public"."${r.tablename.replace(/"/g, '""')}"`)
      .join(", ");
    await pool.query(`truncate table ${names} restart identity cascade`);
  }
}
