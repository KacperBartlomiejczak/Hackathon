// Manual crawl trigger: `npm run crawl -- --source <id>` (in the container: `node dist/cli.js --source <id>`).
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { logger } from './logger.js';
import { createQueues } from './queue/index.js';

const { values } = parseArgs({ options: { source: { type: 'string' } } });
const sourceId = z.coerce.number().int().positive().parse(values.source);

const queues = createQueues();
try {
  const job = await queues.crawlSource.add('source', { sourceId, trigger: 'manual' });
  logger.info({ sourceId, jobId: job.id }, 'crawl-source job queued');
} finally {
  await queues.close();
}
