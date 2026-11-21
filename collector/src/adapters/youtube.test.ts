import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CrawlContext } from './types.js';

process.env.DATABASE_URL = 'postgres://dummy';
const { parseFeed, resolveChannelId, videoHtml } = await import('./youtube.js');

const feed = `<?xml version="1.0"?><feed><title>Kanał</title>
<entry>
  <yt:videoId>abcDEF12345</yt:videoId>
  <title>Zarabiaj z XTB &amp; CFD</title>
  <author><name>Strefa Test</name><uri>https://www.youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxx</uri></author>
  <published>2026-11-20T20:00:04+00:00</published>
  <media:group><media:title>ignored</media:title>
  <media:description>Kod polecający: TEST100 &lt;script&gt;

Link w opisie</media:description></media:group>
</entry>
<entry><yt:videoId>bad</yt:videoId><title>x</title></entry>
<entry><yt:videoId>zzzZZZ_-999</yt:videoId><title>Bez opisu</title><published>nie-data</published></entry>
</feed>`;

test('parseFeed: fields, entities, invalid ids skipped, missing fields', () => {
  assert.deepEqual(parseFeed(feed), [
    {
      videoId: 'abcDEF12345',
      title: 'Zarabiaj z XTB & CFD',
      author: 'Strefa Test',
      publishedAt: '2026-11-20T20:00:04.000Z',
      description: 'Kod polecający: TEST100 <script>\n\nLink w opisie',
    },
    { videoId: 'zzzZZZ_-999', title: 'Bez opisu', author: '', publishedAt: null, description: '' },
  ]);
});

test('videoHtml escapes feed content', () => {
  const html = videoHtml({ title: 'a<b', author: 'K', description: '<script>x</script>\n\ndrugi' });
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('<p>drugi</p>'));
});

test('resolveChannelId: /channel/ URL needs no network', async () => {
  const id = 'UC4Qc_TYL6BsqiqXXorBFoaA';
  assert.equal(await resolveChannelId(`https://www.youtube.com/channel/${id}`, {} as CrawlContext), id);
});
