import type { Job } from 'bullmq';
import { eq, sql } from 'drizzle-orm';
import { adapters } from './adapters/index.js';
import type { CrawlContext } from './adapters/types.js';
import { postAnalyze } from './ai/client.js';
import { postCrawlStatus } from './api/client.js';
import { config } from './config.js';
import type { Db } from './db/client.js';
import { crawlRuns, documents, sources } from './db/schema.js';
import { logger } from './logger.js';
import type { Handlers, Queues } from './queue/index.js';
import { urlHash, type Storage } from './storage/s3.js';
import type { CrawlItemJob, CrawlSourceJob } from './types/index.js';
import { randomUserAgent } from './userAgents.js';

const PROXIES = config.PROXY_LIST.split(',').map((p) => p.trim()).filter(Boolean);
let proxyIdx = 0;

type SourceRow = typeof sources.$inferSelect;

function makeContext(source: SourceRow, crawlRunId: number, storage: Storage): CrawlContext {
  return {
    sourceId: source.id,
    crawlRunId,
    source: { name: source.name, startUrl: source.startUrl },
    storage,
    nextUserAgent: randomUserAgent,
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
      // Manual run (POST /sources/:id/run) works for disabled sources too; only the scheduler respects `enabled`.
      if (!source || (!source.enabled && trigger === 'schedule')) {
        logger.warn({ sourceId, trigger }, 'source missing or disabled, skipping');
        return;
      }
      const [run] = await db.insert(crawlRuns).values({ sourceId }).returning({ id: crawlRuns.id });
      if (!run) throw new Error('crawl_runs insert returned nothing');
      await postCrawlStatus({ crawlRunId: run.id, sourceId, status: 'running', itemsFound: 0, error: null });
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
        await postCrawlStatus({ crawlRunId: run.id, sourceId, status: 'ok', itemsFound, error: null });
        logger.info({ sourceId, crawlRunId: run.id, trigger, itemsFound }, 'crawl-source queued items');
      } catch (err) {
        // Not rethrown: a retry would open a second crawl_run for the same trigger.
        const message = err instanceof Error ? err.message : String(err);
        const status = itemsFound ? 'partial' : 'failed';
        await db
          .update(crawlRuns)
          .set({ status, itemsFound, error: message, finishedAt: new Date() })
          .where(eq(crawlRuns.id, run.id));
        await postCrawlStatus({ crawlRunId: run.id, sourceId, status, itemsFound, error: message });
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
      };
      // status is not in `values`: new rows get the column default `fetched`, a re-crawl keeps the analysed state.
      const [row] = await db
        .insert(documents)
        .values({ ...values, urlHash: urlHash(doc.url) })
        .onConflictDoUpdate({ target: documents.urlHash, set: values })
        .returning({ id: documents.id, status: documents.status });
      if (!row) throw new Error('documents upsert returned nothing');
      logger.info({ documentId: row.id, url: doc.url, kind: doc.sourceKind, status: row.status }, 'document stored');
      // Unanalysed or previously failed only: a re-crawl must not rerun the LLM on processed docs. Fire-and-forget, never throws.
      if (row.status === 'fetched' || row.status === 'failed') {
        void postAnalyze(row.id).then(async (ok) => {
          if (ok || !crawlRunId) return;
          // Surface per-document failure in crawl_runs (the run itself is already closed as ok).
          const msg = `analyze failed for document ${row.id}`;
          await db
            .update(crawlRuns)
            .set({ error: sql`CASE WHEN ${crawlRuns.error} IS NULL THEN ${msg} ELSE ${crawlRuns.error} || '; ' || ${msg} END` })
            .where(eq(crawlRuns.id, crawlRunId))
            .catch((err: unknown) => logger.warn({ crawlRunId, err }, 'could not record analyze failure'));
        });
      }
    },
  };
}
