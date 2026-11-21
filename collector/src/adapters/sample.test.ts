import assert from 'node:assert/strict';
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
  assert.equal(items.length, 5); // blog.html + finfluencer.jsonl x3 + m2-ad.json
  JSON.parse(JSON.stringify(items));

  const docs = [];
  for (const it of items) docs.push(await sampleAdapter.fetch(it, ctx));
  assert.equal(Object.keys(stored).length, 5);
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
