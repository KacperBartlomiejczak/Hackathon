import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { z } from 'zod';
import { config } from './config.js';
import { createDb } from './db/client.js';
import { logger } from './logger.js';
import { createQueues, startWorkers } from './queue/index.js';
import { closeBrowser } from './adapters/index.js';
import { createPipeline } from './pipeline.js';
import { createStorage } from './storage/s3.js';

const sourcesSchema = z.object({
  sources: z.array(
    z.object({
      kind: z.enum(['web', 'facebook', 'instagram', 'tiktok', 'youtube', 'sample']),
      name: z.string(),
      start_url: z.string().optional(),
      module_hint: z.number().int().min(1).max(3).nullable().default(null),
      enabled: z.boolean().default(true),
      cron: z.string().nullable().default(null),
    }),
  ),
});

const { sources } = sourcesSchema.parse(parse(await readFile(config.SOURCES_FILE, 'utf8')));

const { db, pool } = createDb(config.DATABASE_URL);
const queues = createQueues();

// TODO(hack): sources upsert (step 16) and scheduler (step 25) still TODO
const workers = startWorkers(createPipeline({ db, storage: createStorage(), queues }));

logger.info({ sources: sources.length }, 'collector started');

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'collector shutting down');
  try {
    await workers.close();
    await closeBrowser();
    await queues.close();
    await pool.end();
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'collector shutdown failed');
    process.exit(1);
  }
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
