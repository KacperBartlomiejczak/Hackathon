import type { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { adapters } from './adapters/index.js';
import type { CrawlContext } from './adapters/types.js';
import { postAnalyze } from './ai/client.js';
import { config } from './config.js';
import type { Db } from './db/client.js';
import { crawlRuns, documents, sources } from './db/schema.js';
import { logger } from './logger.js';
import type { Handlers, Queues } from './queue/index.js';
import { urlHash, type Storage } from './storage/s3.js';
import type { CrawlItemJob, CrawlSourceJob } from './types/index.js';

// shortcut: 3 UAs only, step 19 brings a list of >= 20.
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
];
const PROXIES = config.PROXY_LIST.split(',').map((p) => p.trim()).filter(Boolean);
let uaIdx = 0;
let proxyIdx = 0;

type SourceRow = typeof sources.$inferSelect;

function makeContext(source: SourceRow, crawlRunId: number, storage: Storage): CrawlContext {
  return {
    sourceId: source.id,
    crawlRunId,
    source: { name: source.name, startUrl: source.startUrl },
    storage,
    nextUserAgent: () => USER_AGENTS[uaIdx++ % USER_AGENTS.length] as string,
    nextProxy: () => (PROXIES.length ? PROXIES[proxyIdx++ % PROXIES.length] : undefined),
  };
}

export function createPipeline(deps: { db: Db; storage: Storage; queues: Queues }): Handlers {
  const { db, storage, queues } = deps;

  const loadSource = async (id: number): Promise<SourceRow | undefined> =>
    (await db.select().from(sources).where(eq(sources.id, id)))[0];

  return {
    async onSource(job: Job<CrawlSourceJob>) {
      const { sourceId, trigger } = job.data;
      const source = await loadSource(sourceId);
      if (!source || !source.enabled) {
        logger.warn({ sourceId, trigger }, 'source missing or disabled, skipping');
        return;
      }
      const [run] = await db.insert(crawlRuns).values({ sourceId }).returning({ id: crawlRuns.id });
      if (!run) throw new Error('crawl_runs insert returned nothing');
      const adapter = adapters[source.kind as keyof typeof adapters];
      let itemsFound = 0;
      try {
        if (!adapter) throw new Error(`no adapter for kind "${source.kind}"`);
        const ctx = makeContext(source, run.id, storage);
        for await (const item of adapter.discover(ctx)) {
          await queues.crawlItem.add('item', { sourceId, crawlRunId: run.id, item });
          itemsFound++;
        }
        // shortcut: run is closed once items are queued, not when they finish; step 26/28 tracks item outcomes.
        await db
          .update(crawlRuns)
          .set({ status: 'ok', itemsFound, finishedAt: new Date() })
          .where(eq(crawlRuns.id, run.id));
        logger.info({ sourceId, crawlRunId: run.id, trigger, itemsFound }, 'crawl-source queued items');
      } catch (err) {
        // Not rethrown: a retry would open a second crawl_run for the same trigger.
        const message = err instanceof Error ? err.message : String(err);
        await db
          .update(crawlRuns)
          .set({ status: itemsFound ? 'partial' : 'failed', itemsFound, error: message, finishedAt: new Date() })
          .where(eq(crawlRuns.id, run.id));
        logger.error({ sourceId, crawlRunId: run.id, err }, 'crawl-source failed');
      }
    },

    async onItem(job: Job<CrawlItemJob>) {
      const { sourceId, crawlRunId, item } = job.data;
      const source = await loadSource(sourceId);
      const adapter = source && adapters[source.kind as keyof typeof adapters];
      if (!source || !adapter) {
        logger.warn({ sourceId, url: item.url }, 'crawl-item without source/adapter, skipping');
        return;
      }
      // Errors propagate so BullMQ retries (3x, exponential backoff); one bad URL never stops the run.
      const doc = await adapter.fetch(item, makeContext(source, crawlRunId, storage));
      const values = {
        url: doc.url,
        sourceId: doc.sourceId,
        crawlRunId: doc.crawlRunId,
        sourceKind: doc.sourceKind,
        fetchedAt: new Date(doc.fetchedAt),
        publishedAt: doc.publishedAt ? new Date(doc.publishedAt) : null,
        authorHandle: doc.authorHandle,
        title: doc.title,
        htmlKey: doc.htmlKey,
        screenshotKey: doc.screenshotKey,
        status: 'fetched',
      };
      const [row] = await db
        .insert(documents)
        .values({ ...values, urlHash: urlHash(doc.url) })
        .onConflictDoUpdate({ target: documents.urlHash, set: values })
        .returning({ id: documents.id });
      if (!row) throw new Error('documents upsert returned nothing');
      logger.info({ documentId: row.id, url: doc.url, kind: doc.sourceKind }, 'document stored');
      void postAnalyze(row.id); // fire-and-forget, never throws; ai down = document stays `fetched`
    },
  };
}
