import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { config } from './config.js';
import { createDb } from './db/client.js';
import { logger } from './logger.js';
import { createQueues, startWorkers } from './queue/index.js';
import { closeBrowser } from './adapters/index.js';
import { createPipeline } from './pipeline.js';
import { syncSchedulers } from './scheduler.js';
import { sourcesFileSchema, syncSources } from './sources.js';
import { createStorage } from './storage/s3.js';

const { sources } = sourcesFileSchema.parse(parse(await readFile(config.SOURCES_FILE, 'utf8')));

const { db, pool } = createDb(config.DATABASE_URL);
const queues = createQueues();

const workers = startWorkers(createPipeline({ db, storage: createStorage(), queues }));

const synced = await syncSources(db, sources);
await syncSchedulers(queues.crawlSource, synced);
if (config.CRAWL_ON_START) {
  const startedAt = Date.now();
  for (const s of synced.filter((x) => x.enabled)) {
    await queues.crawlSource.add(
      'source',
      { sourceId: s.id, trigger: 'manual' },
      { jobId: `start-${s.id}-${startedAt}` },
    );
  }
}

logger.info({ sources: synced.length, crawlOnStart: config.CRAWL_ON_START }, 'collector started');

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
