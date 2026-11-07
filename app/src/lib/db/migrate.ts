import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import path from "node:path";

/** Applies the SQL migrations in app/drizzle to the given database. */
export async function runMigrations(connectionString: string): Promise<void> {
  const pool = new Pool({ connectionString });
  try {
    await migrate(drizzle(pool), {
      migrationsFolder: path.resolve(process.cwd(), "drizzle"),
    });
  } finally {
    await pool.end();
  }
}

// CLI entry (npm run db:migrate, which passes --env-file-if-exists=../.env): uses DATABASE_URL only, never the test DB.
if (process.argv[1] && /migrate\.[cm]?[jt]s$/.test(process.argv[1])) {
  (async () => {
    // DATABASE_URL comes from the environment; the npm script loads ../.env (repo root).
    const url = process.env.DATABASE_URL;
    if (!url) {
      console.error("DATABASE_URL is not set");
      process.exit(1);
    }
    await runMigrations(url);
    console.log("Migrations applied");
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
