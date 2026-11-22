import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.DATABASE_URL = 'postgres://dummy';
const { extractVideoLinks, parseOembed, videoHtml, isVideoUrl, parseVideoPageCaption } = await import('./tiktok.js');

test('extractVideoLinks: dedupes anchors, strips query, ignores other links, caps', () => {
  const hrefs = [
    'https://www.tiktok.com/@jan/video/111?lang=pl',
    'https://www.tiktok.com/@jan/video/111',
    'https://www.tiktok.com/@jan/video/222',
    'https://www.tiktok.com/@jan',
  ];
  assert.deepEqual(extractVideoLinks(hrefs), [
    'https://www.tiktok.com/@jan/video/111',
    'https://www.tiktok.com/@jan/video/222',
  ]);
  assert.equal(extractVideoLinks(hrefs, '', 1).length, 1);
});

test('extractVideoLinks: falls back to rehydration JSON', () => {
  const html = '{"uniqueId":"jan","itemList":["333","444"]}';
  assert.deepEqual(extractVideoLinks([], html), [
    'https://www.tiktok.com/@jan/video/333',
    'https://www.tiktok.com/@jan/video/444',
  ]);
  assert.deepEqual(extractVideoLinks([], '<html></html>'), []);
});

test('parseOembed: handles missing fields', () => {
  const url = 'https://www.tiktok.com/@jan/video/1';
  assert.deepEqual(parseOembed({ title: ' Kup XTB ', author_name: 'Jan K', author_unique_id: 'jan_k' }, url), {
    caption: 'Kup XTB',
    authorHandle: 'jan_k',
    authorName: 'Jan K',
  });
  assert.deepEqual(parseOembed({}, url), { caption: '', authorHandle: 'jan', authorName: null });
  assert.equal(parseOembed(null, 'x').authorHandle, null);
});

test('videoHtml escapes and includes author; isVideoUrl', () => {
  const html = videoHtml('<b>zysk</b>', 'jan');
  assert.match(html, /Autor: @jan/);
  assert.ok(!html.includes('<b>'));
  assert.ok(isVideoUrl('https://www.tiktok.com/@a/video/1'));
  assert.ok(!isVideoUrl('https://www.tiktok.com/@a'));
});

test('parseVideoPageCaption: reads desc, tolerates garbage', () => {
  const j = JSON.stringify({ __DEFAULT_SCOPE__: { 'webapp.video-detail': { itemInfo: { itemStruct: { desc: ' Opis #x ' } } } } });
  assert.equal(parseVideoPageCaption(j), 'Opis #x');
  assert.equal(parseVideoPageCaption('nie json'), '');
  assert.equal(parseVideoPageCaption('{}'), '');
});
