import assert from 'node:assert/strict';
import { test } from 'node:test';
import { USER_AGENTS, randomUserAgent } from './userAgents.js';

test('at least 20 unique real User-Agents', () => {
  assert.ok(USER_AGENTS.length >= 20);
  assert.equal(new Set(USER_AGENTS).size, USER_AGENTS.length);
  for (const ua of USER_AGENTS) assert.ok(ua.startsWith('Mozilla/5.0 ('), ua);
});

test('randomUserAgent returns entries from the list with variety', () => {
  const seen = new Set(Array.from({ length: 200 }, randomUserAgent));
  for (const ua of seen) assert.ok((USER_AGENTS as readonly string[]).includes(ua));
  assert.ok(seen.size > 5);
});
