// TikTok adapter: public profile (Playwright) -> video links; public oEmbed (no key) -> caption + author.
// No login, no CAPTCHA bypass: when TikTok blocks us we log a warning and yield nothing.
import type { Page } from 'playwright';
import { logger } from '../logger.js';
import { htmlKey, urlHash } from '../storage/s3.js';
import { isBlockedUrl } from './ssrf.js';
import type { CollectedDocument, CrawlContext, DiscoveredItem, SourceAdapter } from './types.js';
import { getBrowser } from './web.js';

const TIMEOUT_MS = 15_000;
const MAX_VIDEOS = 15;
const SETTLE_MS = 5_000;
const VIDEO_PATH = /\/@([^/?#"'\s]+)\/video\/(\d+)/;

export interface OembedInfo {
  caption: string;
  authorHandle: string | null;
  authorName: string | null;
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const canonical = (user: string, id: string): string => `https://www.tiktok.com/@${user}/video/${id}`;

export const isVideoUrl = (url: string): boolean => /^https?:\/\/(www\.)?tiktok\.com\/@[^/]+\/video\/\d+/.test(url);

/** Unique canonical video URLs from anchor hrefs, falling back to the rehydration JSON in the page HTML. */
export function extractVideoLinks(hrefs: string[], html = '', limit = MAX_VIDEOS): string[] {
  const out = new Set<string>();
  for (const h of hrefs) {
    const m = VIDEO_PATH.exec(h);
    if (m?.[1] && m[2]) out.add(canonical(m[1], m[2]));
  }
  if (out.size === 0) {
    const user = /"uniqueId":"([^"]+)"/.exec(html)?.[1];
    // itemList is an array of video ids on profile pages.
    const list = /"itemList":\[((?:"\d+",?)+)\]/.exec(html)?.[1] ?? '';
    for (const [, id = ''] of list.matchAll(/"(\d+)"/g)) if (user) out.add(canonical(user, id));
  }
  return [...out].slice(0, limit);
}

export function parseOembed(json: unknown, url: string): OembedInfo {
  const o = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>;
  const str = (k: string): string => (typeof o[k] === 'string' ? o[k].trim() : '');
  const fromUrl = VIDEO_PATH.exec(url)?.[1] ?? null;
  return {
    caption: str('title'),
    authorHandle: str('author_unique_id') || fromUrl || str('author_name') || null,
    authorName: str('author_name') || null,
  };
}

export function parseVideoPageCaption(json: string): string {
  try {
    const d = JSON.parse(json) as { __DEFAULT_SCOPE__?: Record<string, { itemInfo?: { itemStruct?: { desc?: unknown } } }> };
    const desc = d.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct?.desc;
    return typeof desc === 'string' ? desc.trim() : '';
  } catch {
    return '';
  }
}

export function videoHtml(caption: string, handle: string | null): string {
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>${escapeHtml(caption)}</title></head><body><article>\n<p>Autor: @${escapeHtml(handle ?? '')}</p>\n<p>${escapeHtml(caption).replace(/\n/g, '<br>')}</p>\n</article></body></html>`;
}

export async function withPage<T>(ctx: CrawlContext, url: string, read: (page: Page) => Promise<T>): Promise<T> {
  const proxy = ctx.nextProxy();
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: ctx.nextUserAgent(),
    locale: 'pl-PL',
    ...(proxy ? { proxy: { server: proxy } } : {}),
  });
  try {
    await context.route('**/*', async (route) => {
      const u = route.request().url();
      if (await isBlockedUrl(u)) {
        logger.warn({ url: u, source: ctx.source.name }, 'blocked request to internal address');
        await route.abort('blockedbyclient');
      } else {
        await route.continue();
      }
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(SETTLE_MS);
    return await read(page);
  } finally {
    await context.close();
  }
}

const listProfileVideos = (startUrl: string, ctx: CrawlContext): Promise<string[]> =>
  withPage(ctx, startUrl, async (page) => {
    const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => (a as HTMLAnchorElement).href));
    return extractVideoLinks(hrefs, await page.content());
  });

/** Caption from the video page's rehydration JSON; used when oEmbed returns no title. */
const pageCaption = (url: string, ctx: CrawlContext): Promise<string> =>
  withPage(ctx, url, async (page) => {
    const json = await page.$eval('#__UNIVERSAL_DATA_FOR_REHYDRATION__', (e) => e.textContent).catch(() => null);
    return parseVideoPageCaption(json ?? '');
  });

export const tiktokAdapter: SourceAdapter = {
  kind: 'tiktok',

  async *discover(ctx: CrawlContext): AsyncIterable<DiscoveredItem> {
    const startUrl = ctx.source.startUrl;
    if (!startUrl) throw new Error(`tiktok source "${ctx.source.name}" has no start_url`);
    if (await isBlockedUrl(startUrl)) throw new Error(`blocked start_url: ${startUrl}`);
    const urls = isVideoUrl(startUrl) ? [startUrl] : await listProfileVideos(startUrl, ctx);
    if (urls.length === 0) {
      logger.warn({ source: ctx.source.name, startUrl }, 'tiktok: no videos found (profile missing or blocked)');
      return;
    }
    logger.info({ source: ctx.source.name, videos: urls.length }, 'tiktok videos discovered');
    for (const url of urls) yield { url };
  },

  async fetch(item: DiscoveredItem, ctx: CrawlContext): Promise<CollectedDocument> {
    if (await isBlockedUrl(item.url)) throw new Error(`blocked url: ${item.url}`);
    const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(item.url)}`, {
      headers: { 'User-Agent': ctx.nextUserAgent(), 'Accept-Language': 'pl-PL,pl;q=0.9' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from tiktok oembed for ${item.url}`);
    const info = parseOembed(await res.json(), item.url);
    if (!info.caption) {
      info.caption = await pageCaption(item.url, ctx).catch((err: unknown) => {
        logger.warn({ url: item.url, err: String(err) }, 'tiktok: caption fallback failed');
        return '';
      });
    }
    const now = new Date();
    const key = await ctx.storage.putHtml(htmlKey(urlHash(item.url), now), videoHtml(info.caption, info.authorHandle));
    logger.info({ url: item.url, author: info.authorHandle }, 'tiktok video stored');
    return {
      url: item.url,
      sourceKind: 'tiktok',
      sourceId: ctx.sourceId,
      crawlRunId: ctx.crawlRunId,
      fetchedAt: now.toISOString(),
      publishedAt: null,
      authorHandle: info.authorHandle,
      title: info.caption || null,
      htmlKey: key,
      screenshotKey: null,
      extra: { videoId: VIDEO_PATH.exec(item.url)?.[2] ?? null, authorName: info.authorName },
    };
  },
};
