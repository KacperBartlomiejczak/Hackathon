import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';

process.env.DATABASE_URL = 'dummy';
const { postAnalyze } = await import('./client.js');

async function serve(codes: number[]): Promise<{ url: string; hits: () => number; close: () => void }> {
  let n = 0;
  const server = createServer((_req, res) => {
    res.statusCode = codes[Math.min(n++, codes.length - 1)] ?? 200;
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, hits: () => n, close: () => server.close() };
}

test('200 returns true', async () => {
  const s = await serve([200]);
  assert.equal(await postAnalyze(1, s.url, 5), true);
  assert.equal(s.hits(), 1);
  s.close();
});

test('501 is final, no retry', async () => {
  const s = await serve([501]);
  assert.equal(await postAnalyze(1, s.url, 5), false);
  assert.equal(s.hits(), 1);
  s.close();
});

test('503 twice then 200 retries', async () => {
  const s = await serve([503, 503, 200]);
  assert.equal(await postAnalyze(1, s.url, 5), true);
  assert.equal(s.hits(), 3);
  s.close();
});

test('502 is final, no retry', async () => {
  const s = await serve([502]);
  assert.equal(await postAnalyze(1, s.url, 5), false);
  assert.equal(s.hits(), 1);
  s.close();
});

test('timeout is final, no retry', async () => {
  let hits = 0;
  const server = createServer(() => {
    hits++; // never responds
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  assert.equal(await postAnalyze(1, `http://127.0.0.1:${port}`, 5, 100), false);
  assert.equal(hits, 1);
  server.closeAllConnections();
  server.close();
});

test('closed port returns false without throwing', async () => {
  const s = await serve([200]);
  const url = s.url;
  s.close();
  assert.equal(await postAnalyze(1, url, 5), false);
});
