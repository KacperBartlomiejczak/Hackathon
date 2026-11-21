// Contract: "Format dokumentu z collectora" in docs/contracts.md.
import type { Storage } from '../storage/s3.js';

export type SourceKind = 'web' | 'facebook' | 'instagram' | 'tiktok' | 'youtube' | 'sample';

export interface CrawlContext {
  sourceId: number;
  crawlRunId: number;
  /** Row from `sources` that started this crawl. */
  source: { name: string; startUrl: string | null };
  /** Adapters write HTML/screenshots themselves and return the S3 keys in CollectedDocument. */
  storage: Storage;
  nextUserAgent(): string;
  /** undefined = no proxy (PROXY_LIST empty). */
  nextProxy(): string | undefined;
}

export interface DiscoveredItem {
  url: string;
  extra?: Record<string, unknown>;
}

export interface CollectedDocument {
  url: string;
  sourceKind: SourceKind;
  sourceId: number;
  crawlRunId: number;
  fetchedAt: string;
  publishedAt: string | null;
  authorHandle: string | null;
  title: string | null;
  htmlKey: string | null;
  screenshotKey: string | null;
  extra: Record<string, unknown>;
}

export interface SourceAdapter {
  kind: SourceKind;
  discover(ctx: CrawlContext): AsyncIterable<DiscoveredItem>;
  fetch(item: DiscoveredItem, ctx: CrawlContext): Promise<CollectedDocument>;
}
