import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isBlockedUrl } from './ssrf.js';

test('internal and non-http URLs are blocked', async () => {
  for (const url of [
    'http://127.0.0.1/', 'http://169.254.169.254/latest/meta-data', 'http://localhost:11434/api/tags',
    'http://[::1]/', 'http://10.0.0.5/', 'http://192.168.1.1/', 'http://[::ffff:127.0.0.1]/',
    'ftp://example.com/', 'file:///etc/passwd', 'not a url',
  ]) {
    assert.equal(await isBlockedUrl(url), true, url);
  }
});

test('public IP and data URLs pass', async () => {
  assert.equal(await isBlockedUrl('https://1.1.1.1/'), false);
  assert.equal(await isBlockedUrl('data:image/png;base64,AAAA'), false);
});
