// YouTube adapter: public channel RSS feed (no API key, no JS) -> one document per video.
// Feed gives the last 15 videos: title, channel name, published date, description (gold for M1).
import { logger } from '../logger.js';
import { htmlKey, urlHash } from '../storage/s3.js';
import type { CollectedDocument, CrawlContext, DiscoveredItem, SourceAdapter } from './types.js';

const TIMEOUT_MS = 15_000;
const CHANNEL_ID = /(?:\/channel\/|channel_id=)(UC[A-Za-z0-9_-]{22})/;

export interface FeedVideo {
  videoId: string;
  title: string;
  author: string;
  publishedAt: string | null;
  description: string;
}

const decodeXml = (s: string): string =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');

const tag = (xml: string, name: string): string => {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(xml);
  return m?.[1] ? decodeXml(m[1]).trim() : '';
};

export function parseFeed(xml: string): FeedVideo[] {
  const out: FeedVideo[] = [];
  for (const [, entry = ''] of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const videoId = tag(entry, 'yt:videoId');
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) continue;
    const published = tag(entry, 'published');
    out.push({
      videoId,
      title: tag(entry, 'title'),
      author: tag(tag(entry, 'author'), 'name'),
      publishedAt: published && !Number.isNaN(Date.parse(published)) ? new Date(published).toISOString() : null,
      description: tag(entry, 'media:description'),
    });
  }
  return out;
}

async function get(url: string, ctx: CrawlContext): Promise<string> {
  const res = await fetch(url, {
    // SOCS: skips the EU cookie-consent interstitial on channel pages.
    headers: { 'User-Agent': ctx.nextUserAgent(), 'Accept-Language': 'pl-PL,pl;q=0.9', Cookie: 'SOCS=CAI' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

/** /channel/UC… URL -> id directly; @handle URL -> id read from the channel page. */
export async function resolveChannelId(startUrl: string, ctx: CrawlContext): Promise<string> {
  const direct = CHANNEL_ID.exec(startUrl)?.[1];
  if (direct) return direct;
  const id = CHANNEL_ID.exec(await get(startUrl, ctx))?.[1];
  if (!id) throw new Error(`no channel id found on ${startUrl}`);
  return id;
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function videoHtml(v: Pick<FeedVideo, 'title' | 'author' | 'description'>): string {
  const paras = v.description
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>${escapeHtml(v.title)}</title></head><body><article>\n<h1>${escapeHtml(v.title)}</h1>\n<p>Kanał: ${escapeHtml(v.author)}</p>\n${paras}\n</article></body></html>`;
}

export const youtubeAdapter: SourceAdapter = {
  kind: 'youtube',

  async *discover(ctx: CrawlContext): AsyncIterable<DiscoveredItem> {
    const startUrl = ctx.source.startUrl;
    if (!startUrl) throw new Error(`youtube source "${ctx.source.name}" has no start_url`);
    const channelId = await resolveChannelId(startUrl, ctx);
    const videos = parseFeed(await get(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, ctx));
    logger.info({ source: ctx.source.name, channelId, videos: videos.length }, 'youtube feed read');
    for (const v of videos) {
      yield {
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
        extra: { channelId, title: v.title, author: v.author, publishedAt: v.publishedAt, description: v.description },
      };
    }
  },

  async fetch(item: DiscoveredItem, ctx: CrawlContext): Promise<CollectedDocument> {
    const e = item.extra ?? {};
    const str = (k: string): string => (typeof e[k] === 'string' ? e[k] : '');
    const v = { title: str('title'), author: str('author'), description: str('description') };
    const now = new Date();
    const key = await ctx.storage.putHtml(htmlKey(urlHash(item.url), now), videoHtml(v));
    logger.info({ url: item.url, channelId: str('channelId') }, 'youtube video stored');
    return {
      url: item.url,
      sourceKind: 'youtube',
      sourceId: ctx.sourceId,
      crawlRunId: ctx.crawlRunId,
      fetchedAt: now.toISOString(),
      publishedAt: str('publishedAt') || null,
      authorHandle: v.author || null,
      title: v.title || null,
      htmlKey: key,
      screenshotKey: null,
      extra: { channelId: str('channelId') },
    };
  },
};
