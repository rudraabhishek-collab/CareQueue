import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext } from '../helpers/context.js';

test('GET /api/v1/health returns ok with service name', async () => {
  const ctx = createTestContext();
  const res = await ctx.request(ctx.app).get('/api/v1/health');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: 'ok', service: 'carequeue-api' });
  ctx.cleanup();
});

test('GET /api/v1/health/db reports database status without exposing internals', async () => {
  const ctx = createTestContext();
  const res = await ctx.request(ctx.app).get('/api/v1/health/db');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { data: { status: 'ok' } });
  ctx.cleanup();
});
