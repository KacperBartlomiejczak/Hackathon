import { Queue } from "bullmq";
import type { FastifyBaseLogger } from "fastify";
import type { CrawlJobPayload } from "../types/sources.js";

export const CRAWL_QUEUE_NAME = "crawl-source";
const ENQUEUE_TIMEOUT_MS = 3000;

export type CrawlQueue = {
  enqueue(payload: CrawlJobPayload): Promise<string>;
  close(): Promise<void>;
};

export function createCrawlQueue(valkeyUrl: string, log: FastifyBaseLogger): CrawlQueue {
  const queue = new Queue<CrawlJobPayload>(CRAWL_QUEUE_NAME, {
    // Fail fast when Valkey is down instead of buffering commands forever.
    connection: { url: valkeyUrl, enableOfflineQueue: false, maxRetriesPerRequest: 1 },
  });

  // Without a listener, connection errors would surface as unhandled 'error' events.
  let lastErrorLog = 0;
  queue.on("error", (err) => {
    const now = Date.now();
    if (now - lastErrorLog > 30_000) {
      lastErrorLog = now;
      log.warn({ err, queue: CRAWL_QUEUE_NAME }, "crawl queue connection error");
    }
  });

  return {
    async enqueue(payload) {
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("enqueue timeout")), ENQUEUE_TIMEOUT_MS);
      });
      try {
        const job = await Promise.race([
          queue.add(`crawl:${payload.sourceId}`, payload, {
            removeOnComplete: 1000,
            removeOnFail: 1000,
          }),
          timeout,
        ]);
        if (!job.id) throw new Error("job id missing");
        return job.id;
      } finally {
        clearTimeout(timer);
      }
    },
    close: () => queue.close(),
  };
}
