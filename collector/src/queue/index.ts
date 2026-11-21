import { Queue, Worker, type ConnectionOptions, type Job, type JobsOptions } from 'bullmq';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { QUEUE_NAMES, type CrawlItemJob, type CrawlSourceJob } from '../types/index.js';

const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
};

export function valkeyConnection(url: string = config.VALKEY_URL): ConnectionOptions {
  const u = new URL(url);
  const db = u.pathname.length > 1 ? Number(u.pathname.slice(1)) : undefined;
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 6379,
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: db !== undefined && Number.isInteger(db) ? db : undefined,
    maxRetriesPerRequest: null, // required by BullMQ workers (blocking commands)
  };
}

export interface Queues {
  crawlSource: Queue<CrawlSourceJob>;
  crawlItem: Queue<CrawlItemJob>;
  close(): Promise<void>;
}

function makeQueue<T>(name: string, connection: ConnectionOptions): Queue<T> {
  const queue = new Queue<T>(name, { connection, defaultJobOptions });
  queue.on('error', (err) => logger.error({ queue: name, err }, 'queue error'));
  return queue;
}

export function createQueues(connection: ConnectionOptions = valkeyConnection()): Queues {
  const crawlSource = makeQueue<CrawlSourceJob>(QUEUE_NAMES.crawlSource, connection);
  const crawlItem = makeQueue<CrawlItemJob>(QUEUE_NAMES.crawlItem, connection);
  return {
    crawlSource,
    crawlItem,
    async close() {
      await Promise.all([crawlSource.close(), crawlItem.close()]);
    },
  };
}

export interface Handlers {
  onSource(job: Job<CrawlSourceJob>): Promise<void>;
  onItem(job: Job<CrawlItemJob>): Promise<void>;
}

export interface Workers {
  close(): Promise<void>;
}

function makeWorker<T>(
  name: string,
  handler: (job: Job<T>) => Promise<void>,
  concurrency: number,
  connection: ConnectionOptions,
): Worker<T> {
  const worker = new Worker<T>(name, handler, { connection, concurrency });
  worker.on('completed', (job) => {
    const durationMs =
      job.finishedOn !== undefined && job.processedOn !== undefined
        ? job.finishedOn - job.processedOn
        : undefined;
    logger.info({ queue: name, jobId: job.id, durationMs }, 'job completed');
  });
  worker.on('failed', (job, err) => {
    logger.error({ queue: name, jobId: job?.id, attemptsMade: job?.attemptsMade, err }, 'job failed');
  });
  worker.on('error', (err) => logger.error({ queue: name, err }, 'worker error'));
  return worker;
}

export function startWorkers(
  handlers: Handlers,
  connection: ConnectionOptions = valkeyConnection(),
): Workers {
  const source = makeWorker<CrawlSourceJob>(QUEUE_NAMES.crawlSource, handlers.onSource, 1, connection);
  const item = makeWorker<CrawlItemJob>(QUEUE_NAMES.crawlItem, handlers.onItem, 4, connection);
  return {
    async close() {
      await Promise.all([source.close(), item.close()]);
    },
  };
}
