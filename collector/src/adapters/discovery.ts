// Depth-1 link discovery for the web adapter: same-host links whose URL or anchor text matches a keyword.

export const KEYWORDS = [
  'forex',
  'cfd',
  'dom maklerski',
  'sygnaly',
  'kurs inwestowania',
  'inwest',
  'broker',
  'gielda',
  'kryptowaluty',
  'etf',
] as const;

const FILE_EXT = /\.(pdf|jpe?g|png|gif|webp|svg|zip|mp3|mp4|xml|css|js)$/i;
const ANCHOR = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi;

/** Lowercase, strip Polish diacritics, turn URL separators into spaces. */
const fold = (s: string): string =>
  s
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[-_/.+%]/g, ' ');

export function extractLinks(
  html: string,
  baseUrl: string,
  keywords: readonly string[] = KEYWORDS,
  max = 20,
): string[] {
  const base = new URL(baseUrl);
  const host = base.hostname.replace(/^www\./, '');
  const out = new Map<string, string>(); // key without www. -> url
  for (const m of html.matchAll(ANCHOR)) {
    if (out.size >= max) break;
    const href = (m[1] ?? m[2] ?? '').trim();
    let url: URL;
    try {
      url = new URL(href, base);
    } catch {
      continue;
    }
    if (!['http:', 'https:'].includes(url.protocol)) continue;
    if (url.hostname.replace(/^www\./, '') !== host) continue;
    if (FILE_EXT.test(url.pathname)) continue;
    url.hash = '';
    const s = url.toString();
    const key = s.replace('://www.', '://');
    if (key === base.toString().replace('://www.', '://') || out.has(key)) continue;
    let path = url.pathname;
    try {
      path = decodeURIComponent(path);
    } catch {
      // malformed %-escape: match on the raw path
    }
    const text = fold(`${path} ${(m[3] ?? '').replace(/<[^>]+>/g, ' ')}`);
    if (keywords.some((k) => text.includes(fold(k)))) out.set(key, s);
  }
  return [...out.values()];
}
