// Facebook adapter: public pages without login. We read only what the logged-out page shows
// (og:title / og:description for a page, visible text for a single post permalink).
// No login, no cookies, no CAPTCHA bypass: a walled or unavailable page ends as a readable error in crawl_runs.
import { logger } from '../logger.js';
import { htmlKey, urlHash } from '../storage/s3.js';
import { isBlockedUrl } from './ssrf.js';
import { withPage } from './tiktok.js';
import type { CollectedDocument, CrawlContext, DiscoveredItem, SourceAdapter } from './types.js';

const MAX_POSTS = 5;
const MAX_TEXT = 4_000;
const POST_PATH = /^https?:\/\/(?:www\.|m\.)?facebook\.com\/([^/?#]+)\/posts\/([A-Za-z0-9]+)/;
const UNAVAILABLE = /Te materiały nie są teraz dostępne|This content isn't available/i;
// Login-wall and cookie-banner lines that sit in the page text of every logged-out page.
const NOISE = /Zaloguj się|Nie pamiętasz nazwy konta|Utwórz nowe konto|Zezwolić na użycie plików cookie|Konta z oznaczeniem potwierdzającym|Log in|Forgot account/i;

export interface FbPage {
  title: string;
  ogTitle: string;
  ogDescription: string;
  bodyText: string;
}

export interface FbContent {
  title: string;
  text: string;
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const isPostUrl = (url: string): boolean => POST_PATH.test(url);

/** First path segment = page handle. */
export const pageHandle = (url: string): string | null => /facebook\.com\/([^/?#]+)/.exec(url)?.[1] ?? null;

/** Canonical post permalinks (no tracking query), unique, capped. */
export function extractPostLinks(hrefs: string[], limit = MAX_POSTS): string[] {
  const out = new Set<string>();
  for (const h of hrefs) {
    const m = POST_PATH.exec(h);
    if (m?.[1] && m[2]) out.add(`https://www.facebook.com/${m[1]}/posts/${m[2]}`);
  }
  return [...out].slice(0, limit);
}

/** Throws a readable error when the logged-out page has nothing public; otherwise returns the text to store. */
export function readFacebook(page: FbPage, url: string): FbContent {
  if (UNAVAILABLE.test(page.bodyText) || page.title.trim() === 'Facebook') {
    throw new Error(`facebook: content not available without login (${url})`);
  }
  if (isPostUrl(url)) {
    const text = page.bodyText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !NOISE.test(l))
      .join('\n')
      .slice(0, MAX_TEXT);
    if (!text) throw new Error(`facebook: post text not visible without login (${url})`);
    return { title: page.ogTitle || page.title, text };
  }
  if (!page.ogTitle) throw new Error(`facebook: page has no public description (${url})`);
  return { title: page.ogTitle, text: page.ogDescription };
}

export function pageHtml(c: FbContent, handle: string | null): string {
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>${escapeHtml(c.title)}</title></head><body><article>\n<p>Autor: ${escapeHtml(handle ?? '')}</p>\n<p>${escapeHtml(c.text).replace(/\n/g, '<br>')}</p>\n</article></body></html>`;
}

const meta = (page: Parameters<Parameters<typeof withPage>[2]>[0], prop: string): Promise<string> =>
  page.$eval(`meta[property="${prop}"]`, (e) => (e as HTMLMetaElement).content).catch(() => '');

export const facebookAdapter: SourceAdapter = {
  kind: 'facebook',

  async *discover(ctx: CrawlContext): AsyncIterable<DiscoveredItem> {
    const startUrl = ctx.source.startUrl;
    if (!startUrl) throw new Error(`facebook source "${ctx.source.name}" has no start_url`);
    if (await isBlockedUrl(startUrl)) throw new Error(`blocked start_url: ${startUrl}`);
    yield { url: startUrl };
    if (isPostUrl(startUrl)) return;
    // Post permalinks visible on a logged-out page header: usually 0–1, so a failure here only skips them.
    const posts = await withPage(ctx, startUrl, async (page) =>
      extractPostLinks(await page.$$eval('a[href]', (as) => as.map((a) => (a as HTMLAnchorElement).href))),
    ).catch((err: unknown) => {
      logger.warn({ source: ctx.source.name, err: String(err) }, 'facebook: post discovery failed');
      return [] as string[];
    });
    for (const url of posts) yield { url };
  },

  async fetch(item: DiscoveredItem, ctx: CrawlContext): Promise<CollectedDocument> {
    if (await isBlockedUrl(item.url)) throw new Error(`blocked url: ${item.url}`);
    const page = await withPage(ctx, item.url, async (p) => ({
      title: await p.title(),
      ogTitle: await meta(p, 'og:title'),
      ogDescription: await meta(p, 'og:description'),
      bodyText: await p.evaluate(() => document.body.innerText),
    }));
    const content = readFacebook(page, item.url);
    const handle = pageHandle(item.url);
    const now = new Date();
    const key = await ctx.storage.putHtml(htmlKey(urlHash(item.url), now), pageHtml(content, handle));
    logger.info({ url: item.url, handle, post: isPostUrl(item.url) }, 'facebook page stored');
    return {
      url: item.url,
      sourceKind: 'facebook',
      sourceId: ctx.sourceId,
      crawlRunId: ctx.crawlRunId,
      fetchedAt: now.toISOString(),
      publishedAt: null,
      authorHandle: handle,
      title: content.title || null,
      htmlKey: key,
      screenshotKey: null,
      extra: { post: isPostUrl(item.url) },
    };
  },
};
