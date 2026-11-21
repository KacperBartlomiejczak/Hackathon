import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "./schema.js";

export type Db = NodePgDatabase<typeof schema>;

export function createDb(databaseUrl: string, log: FastifyBaseLogger): { db: Db; pool: pg.Pool } {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 10 });
  // Idle-client errors would otherwise crash the process.
  pool.on("error", (err) => log.error({ err }, "postgres pool error"));
  const db = drizzle(pool, { schema, casing: "snake_case" });
  return { db, pool };
}
