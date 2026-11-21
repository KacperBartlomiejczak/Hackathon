// Sample-data importer (UKNF pendrive / local files under DATA_DIR).
// TODO(hack): adjust mapping once UKNF pendrive data arrives.
//
// Field mapping (generic format):
//   *.html / *.htm  -> one document per file; html = file content, title = <title>, url = sample://<file>#0
//   *.json          -> one object or an array of objects -> one document per object
//   *.jsonl         -> one object per line -> one document per line
//   record.url          -> url (valid http(s) only, else sample://<relative path>#<index>)
//   record.title        -> title
//   record.author | record.author_handle -> authorHandle
//   record.published_at -> publishedAt (ISO string, else null)
//   record.html | record.text -> stored HTML (text is escaped, blank lines -> <p>)
//   any other field     -> extra (plus extra.file)
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { htmlKey, urlHash } from '../storage/s3.js';
import type { CollectedDocument, DiscoveredItem, SourceAdapter } from './types.js';

const recordSchema = z
  .object({
    url: z.string().optional(),
    title: z.string().optional(),
    author: z.string().optional(),
    author_handle: z.string().optional(),
    published_at: z.string().optional(),
    text: z.string().optional(),
    html: z.string().optional(),
  })
  .passthrough()
  .refine((r) => r.text !== undefined || r.html !== undefined, { message: 'text or html required' });

type SampleRecord = z.infer<typeof recordSchema>;
type RawRecord = { kind: 'html'; html: string } | { kind: 'json'; record: SampleRecord };

const isHtmlFile = (f: string): boolean => /\.html?$/i.test(f);

const isHttpUrl = (s: string | undefined): s is string => {
  if (!s) return false;
  try {
    const p = new URL(s).protocol;
    return p === 'http:' || p === 'https:';
  } catch {
    return false;
  }
};

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Reads all records of one file; invalid JSON records are skipped (index stays stable). */
async function readRecords(abs: string): Promise<(RawRecord | null)[]> {
  const content = await readFile(abs, 'utf8');
  if (isHtmlFile(abs)) return [{ kind: 'html', html: content }];
  let raws: unknown[];
  if (/\.jsonl$/i.test(abs)) {
    raws = content
      .split(/\r?\n/)
      .filter((l) => l.trim() !== '')
      .map((l) => {
        try {
          return JSON.parse(l) as unknown;
        } catch {
          return null;
        }
      });
  } else {
    const parsed = JSON.parse(content) as unknown;
    raws = Array.isArray(parsed) ? parsed : [parsed];
  }
  return raws.map((r, i) => {
    const res = recordSchema.safeParse(r);
    if (!res.success) {
      logger.warn({ file: abs, index: i, err: res.error.message }, 'sample: invalid record skipped');
      return null;
    }
    return { kind: 'json', record: res.data };
  });
}

async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  for (const e of entries) {
    if (e.isFile()) yield path.join(e.parentPath, e.name);
  }
}

function resolveInside(rel: string): string {
  const root = path.resolve(config.DATA_DIR);
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error(`path outside DATA_DIR: ${rel}`);
  return abs;
}

const wrapText = (title: string, text: string): string => {
  const paras = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body><article>\n${paras}\n</article></body></html>`;
};

export const sampleAdapter: SourceAdapter = {
  kind: 'sample',

  async *discover() {
    const root = path.resolve(config.DATA_DIR);
    try {
      const files: string[] = [];
      for await (const f of walk(root)) files.push(f);
      files.sort();
      for (const abs of files) {
        if (!/\.(html?|jsonl?)$/i.test(abs)) continue;
        const file = path.relative(root, abs).split(path.sep).join('/');
        try {
          const recs = await readRecords(abs);
          for (let index = 0; index < recs.length; index++) {
            const rec = recs[index];
            if (!rec) continue;
            const recUrl = rec.kind === 'json' ? rec.record.url : undefined;
            const item: DiscoveredItem = {
              url: isHttpUrl(recUrl) ? recUrl : `sample://${file}#${index}`,
              extra: { file, index },
            };
            yield item;
          }
        } catch (err) {
          logger.warn({ file, err: String(err) }, 'sample: unreadable file skipped');
        }
      }
    } catch (err) {
      logger.warn({ dir: root, err: String(err) }, 'sample: DATA_DIR not readable');
    }
  },

  async fetch(item, ctx): Promise<CollectedDocument> {
    const started = Date.now();
    const file = String(item.extra?.file ?? '');
    const index = Number(item.extra?.index ?? 0);
    const abs = resolveInside(file);
    const raw = (await readRecords(abs))[index];
    if (!raw) throw new Error(`record not found: ${file}#${index}`);

    let html: string;
    let title: string | null = null;
    let authorHandle: string | null = null;
    let publishedAt: string | null = null;
    let extra: Record<string, unknown> = { file };

    if (raw.kind === 'html') {
      html = raw.html;
      title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? null;
    } else {
      const { title: t, author, author_handle, published_at, text, html: h, ...rest } = raw.record;
      title = t ?? null;
      authorHandle = author_handle ?? author ?? null;
      publishedAt = published_at && !Number.isNaN(Date.parse(published_at)) ? new Date(published_at).toISOString() : null;
      html = h ?? wrapText(title ?? '', text ?? '');
      extra = { ...rest, file };
    }

    const now = new Date();
    const key = await ctx.storage.putHtml(htmlKey(urlHash(item.url), now), html);
    logger.info({ url: item.url, file, durationMs: Date.now() - started }, 'sample: fetched');
    return {
      url: item.url,
      sourceKind: 'sample',
      sourceId: ctx.sourceId,
      crawlRunId: ctx.crawlRunId,
      fetchedAt: now.toISOString(),
      publishedAt,
      authorHandle,
      title,
      htmlKey: key,
      screenshotKey: null,
      extra,
    };
  },
};
