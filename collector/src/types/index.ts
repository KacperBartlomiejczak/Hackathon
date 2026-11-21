// Contract: docs/contracts.md (tables sources/crawl_runs/documents, POST /internal/crawl-status, queue crawl-source).
import type { DiscoveredItem } from '../adapters/types.js';

export type { SourceKind } from '../adapters/types.js';

export const CRAWL_RUN_STATUSES = ['running', 'ok', 'partial', 'failed'] as const;
export type CrawlRunStatus = (typeof CRAWL_RUN_STATUSES)[number];

export const DOCUMENT_STATUSES = ['fetched', 'processed', 'duplicate', 'failed'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const QUEUE_NAMES = { crawlSource: 'crawl-source', crawlItem: 'crawl-item' } as const;

/** Payload of queue `crawl-source`. */
export interface CrawlSourceJob {
  sourceId: number;
  trigger: 'schedule' | 'manual';
}

/** Payload of queue `crawl-item`. */
export interface CrawlItemJob {
  sourceId: number;
  crawlRunId: number;
  item: DiscoveredItem;
}

/** Body of POST /internal/crawl-status (also the `crawl:status` Socket.io payload). */
export interface CrawlStatusPayload {
  crawlRunId: number;
  sourceId: number;
  status: CrawlRunStatus;
  itemsFound: number;
  error?: string | null;
}
