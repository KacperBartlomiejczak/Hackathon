// Repeatable crawl-source jobs from sources.cron (BullMQ job schedulers), synced at startup.
import type { Queue } from 'bullmq';
import { logger } from './logger.js';
import type { CrawlSourceJob } from './types/index.js';

const PREFIX = 'source-';

type SchedulerQueue = Pick<Queue<CrawlSourceJob>, 'upsertJobScheduler' | 'getJobSchedulers' | 'removeJobScheduler'>;

export async function syncSchedulers(
  queue: SchedulerQueue,
  sources: { id: number; enabled: boolean; cron: string | null }[],
): Promise<number> {
  const wanted = new Set<string>();
  for (const s of sources) {
    if (!s.enabled || !s.cron) continue;
    const id = `${PREFIX}${s.id}`;
    try {
      await queue.upsertJobScheduler(
        id,
        { pattern: s.cron, tz: 'Europe/Warsaw' },
        { name: 'source', data: { sourceId: s.id, trigger: 'schedule' } },
      );
      wanted.add(id);
    } catch (err) {
      logger.error({ sourceId: s.id, cron: s.cron, err }, 'invalid cron, source not scheduled');
    }
  }
  for (const j of await queue.getJobSchedulers()) {
    if (j.key.startsWith(PREFIX) && !wanted.has(j.key)) {
      await queue.removeJobScheduler(j.key);
      logger.info({ scheduler: j.key }, 'stale scheduler removed');
    }
  }
  logger.info({ schedulers: wanted.size }, 'schedulers synced');
  return wanted.size;
}
