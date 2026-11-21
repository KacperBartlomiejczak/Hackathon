import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.DATABASE_URL = 'postgres://dummy';
const { syncSchedulers } = await import('./scheduler.js');

test('adds enabled cron sources, skips bad cron, removes stale ones', async () => {
  const keys = new Set(['source-9', 'other-job']);
  const added: unknown[] = [];
  const queue = {
    async upsertJobScheduler(id: string, opts: { pattern?: string }, tpl: unknown) {
      if (opts.pattern === 'zły') throw new Error('Invalid cron');
      keys.add(id);
      added.push({ id, opts, tpl });
    },
    async getJobSchedulers() {
      return [...keys].map((key) => ({ key }));
    },
    async removeJobScheduler(id: string) {
      return keys.delete(id);
    },
  };
  const n = await syncSchedulers(queue as never, [
    { id: 1, enabled: true, cron: '0 */6 * * *' },
    { id: 2, enabled: false, cron: '0 */6 * * *' },
    { id: 3, enabled: true, cron: null },
    { id: 4, enabled: true, cron: 'zły' },
  ]);
  assert.equal(n, 1);
  assert.deepEqual(added, [
    {
      id: 'source-1',
      opts: { pattern: '0 */6 * * *', tz: 'Europe/Warsaw' },
      tpl: { name: 'source', data: { sourceId: 1, trigger: 'schedule' } },
    },
  ]);
  assert.deepEqual([...keys].sort(), ['other-job', 'source-1']);
});
