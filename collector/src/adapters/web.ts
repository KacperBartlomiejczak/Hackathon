import pLimit from 'p-limit';
import { chromium, type Browser, type Page } from 'playwright';
import { logger } from '../logger.js';
import { htmlKey, screenshotKey, urlHash } from '../storage/s3.js';
import type { CollectedDocument, CrawlContext, DiscoveredItem, SourceAdapter } from './types.js';

// Fix these at night when a site's markup differs.
const SELECTORS = {
  title: 'title',
  author: 'meta[name="author"]',
  published: 'meta[property="article:published_time"]',
} as const;

const NAV_TIMEOUT_MS = 30_000;
const PER_HOST_CONCURRENCY = 2;

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    const existing = await browserPromise.catch(() => null);
    if (existing?.isConnected()) return existing;
    browserPromise = null;
  }
  // 'per-context' is required for per-context proxies in Chromium; harmless without one.
  browserPromise = chromium.launch({ headless: true, proxy: { server: 'per-context' } });
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  const pending = browserPromise;
  browserPromise = null;
  if (!pending) return;
  const browser = await pending.catch(() => null);
  await browser?.close();
}

const hostLimits = new Map<string, ReturnType<typeof pLimit>>();

function limitFor(hostname: string): ReturnType<typeof pLimit> {
  let limit = hostLimits.get(hostname);
  if (!limit) {
    limit = pLimit(PER_HOST_CONCURRENCY);
    hostLimits.set(hostname, limit);
  }
  return limit;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function attr(page: Page, selector: string, name: string): Promise<string | null> {
  const value = await page.locator(selector).first().getAttribute(name, { timeout: 1_000 }).catch(() => null);
  return value?.trim() || null;
}

async function extractMeta(page: Page): Promise<{ title: string | null; author: string | null; publishedAt: string | null }> {
  const title = (await page.title().catch(() => '')).trim() || null;
  const author = await attr(page, SELECTORS.author, 'content');
  const rawPublished = await attr(page, SELECTORS.published, 'content');
  const parsed = rawPublished ? new Date(rawPublished) : null;
  const publishedAt = parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null;
  return { title, author, publishedAt };
}

async function fetchOne(item: DiscoveredItem, ctx: CrawlContext): Promise<CollectedDocument> {
  const started = Date.now();
  await sleep(1_000 + Math.random() * 2_000);

  const proxy = ctx.nextProxy();
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: ctx.nextUserAgent(),
    locale: 'pl-PL',
    ...(proxy ? { proxy: { server: proxy } } : {}),
  });
  try {
    const page = await context.newPage();
    const response = await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
    const status = response?.status() ?? 0;
    if (status >= 400) throw new Error(`HTTP ${status} fetching ${item.url}`);

    const html = await page.content();
    const meta = await extractMeta(page);
    const now = new Date();
    const hash = urlHash(item.url);

    let shotKey: string | null = null;
    try {
      const png = await page.screenshot({ fullPage: true, type: 'png', timeout: 30_000 });
      shotKey = await ctx.storage.putScreenshot(screenshotKey(hash, now), png);
    } catch (err) {
      logger.warn({ url: item.url, err }, 'screenshot failed, continuing without it');
    }
    const storedHtmlKey = await ctx.storage.putHtml(htmlKey(hash, now), html);

    logger.info({ url: item.url, status, durationMs: Date.now() - started }, 'web fetched');
    return {
      url: item.url,
      sourceKind: 'web',
      sourceId: ctx.sourceId,
      crawlRunId: ctx.crawlRunId,
      fetchedAt: now.toISOString(),
      publishedAt: meta.publishedAt,
      authorHandle: meta.author,
      title: meta.title,
      htmlKey: storedHtmlKey,
      screenshotKey: shotKey,
      extra: { finalUrl: page.url(), httpStatus: status },
    };
  } finally {
    await context.close();
  }
}

export const webAdapter: SourceAdapter = {
  kind: 'web',

  async *discover(ctx: CrawlContext): AsyncIterable<DiscoveredItem> {
    const startUrl = ctx.source.startUrl;
    let valid = false;
    try {
      valid = !!startUrl && ['http:', 'https:'].includes(new URL(startUrl).protocol);
    } catch {
      valid = false;
    }
    if (!startUrl || !valid) {
      logger.warn({ source: ctx.source.name, startUrl }, 'invalid or missing startUrl, nothing to discover');
      return;
    }
    // TODO(hack): step 20 link discovery
    yield { url: startUrl };
  },

  fetch(item: DiscoveredItem, ctx: CrawlContext): Promise<CollectedDocument> {
    return limitFor(new URL(item.url).hostname)(() => fetchOne(item, ctx));
  },
};
