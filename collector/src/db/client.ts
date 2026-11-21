import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { logger } from '../logger.js';
import * as schema from './schema.js';

export type Db = NodePgDatabase<typeof schema>;

export function createDb(databaseUrl: string): { db: Db; pool: pg.Pool } {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 10 });
  // Idle-client errors (e.g. Postgres restart) would otherwise crash the process.
  pool.on('error', (err) => logger.error({ err }, 'pg pool error'));
  const db = drizzle(pool, { schema, casing: 'snake_case' });
  return { db, pool };
}
