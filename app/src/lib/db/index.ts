import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL não definida: configure o .env na raiz");
}

const globalForDb = globalThis as unknown as { __pgPool?: Pool };

// Reuse the pool across hot reloads in dev so connections don't leak.
const pool =
  globalForDb.__pgPool ??
  new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
if (process.env.NODE_ENV !== "production") globalForDb.__pgPool = pool;

export const db = drizzle(pool, { schema });
export type Db = typeof db;
