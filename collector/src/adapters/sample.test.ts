import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import type { CrawlContext, DiscoveredItem } from './types.js';

process.env.DATA_DIR = path.resolve('fixtures/sample');
process.env.DATABASE_URL = 'postgres://dummy';

test('sample adapter discovers and fetches fixtures', async () => {
  const { sampleAdapter } = await import('./sample.js');
  const stored: Record<string, string> = {};
  const ctx: CrawlContext = {
    sourceId: 1,
    crawlRunId: 2,
    source: { name: 'sample', startUrl: null },
    storage: {
      putHtml: async (key, html) => {
        stored[key] = html;
        return key;
      },
      putScreenshot: async (key) => key,
    },
    nextUserAgent: () => 'ua',
    nextProxy: () => undefined,
  };

  const items: DiscoveredItem[] = [];
  for await (const it of sampleAdapter.discover(ctx)) items.push(it);
  assert.ok(items.length >= 43); // gold-crawl.jsonl adds more; blog.html + demo.jsonl x11 + finfluencer.jsonl x3 + m2-ad.json + gold-synthetic x27
  JSON.parse(JSON.stringify(items));

  const docs = [];
  for (const it of items) docs.push(await sampleAdapter.fetch(it, ctx));
  assert.equal(Object.keys(stored).length, items.length);
  for (const d of docs) {
    assert.equal(d.sourceKind, 'sample');
    assert.ok(d.htmlKey && d.htmlKey in stored);
    assert.equal(d.screenshotKey, null);
  }
  const ad = docs.find((d) => d.url.includes('promocja-zima'));
  assert.ok(ad?.publishedAt?.startsWith('2025-11-03'));
  assert.ok(ad && stored[ad.htmlKey ?? '']?.includes('30% miesięcznie'));
  assert.equal(docs.find((d) => d.url.includes('kasa_z_marta'))?.authorHandle, '@kasa_z_marta');
  assert.ok(docs.find((d) => d.url.startsWith('sample://blog.html'))?.title?.includes('forex'));
});

test('gold-synthetic fixtures keep their http(s) URLs unchanged', async () => {
  const { sampleAdapter } = await import('./sample.js');
  const ctx = { source: { name: 'sample', startUrl: null }, nextUserAgent: () => 'ua', nextProxy: () => undefined } as unknown as CrawlContext;
  const urls = new Set<string>();
  for await (const it of sampleAdapter.discover(ctx)) urls.add(it.url);
  const expected = ['gold-synthetic-m2.jsonl', 'gold-synthetic-m1-m3.jsonl'].flatMap((f) =>
    readFileSync(path.join('fixtures/sample', f), 'utf8')
      .split(String.fromCharCode(10))
      .filter((l) => l.trim() !== '')
      .map((l) => (JSON.parse(l) as { url: string }).url),
  );
  assert.equal(expected.length, 27);
  for (const u of expected) assert.ok(urls.has(u), u);
});
