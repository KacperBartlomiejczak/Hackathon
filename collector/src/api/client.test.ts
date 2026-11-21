import assert from 'node:assert/strict';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';

process.env.DATABASE_URL = 'dummy';
const { postCrawlStatus } = await import('./client.js');

const payload = { crawlRunId: 12, sourceId: 3, status: 'running' as const, itemsFound: 0, error: null };

test('sends token header and payload', async () => {
  let headers: IncomingHttpHeaders = {};
  let body = '';
  const server = createServer((req, res) => {
    headers = req.headers;
    req.on('data', (c: Buffer) => (body += c.toString()));
    req.on('end', () => {
      res.statusCode = 202;
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  assert.equal(await postCrawlStatus(payload, `http://127.0.0.1:${port}`, 'tok'), true);
  assert.equal(headers['x-internal-token'], 'tok');
  assert.deepEqual(JSON.parse(body), payload);
  server.close();
});

test('closed port returns false without throwing', async () => {
  assert.equal(await postCrawlStatus(payload, 'http://127.0.0.1:1', 'tok'), false);
});
