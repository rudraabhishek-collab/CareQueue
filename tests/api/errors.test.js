import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext } from '../helpers/context.js';

test('unknown API endpoint returns 404 with error envelope', async () => {
  const ctx = createTestContext();
  const res = await ctx.request(ctx.app).get('/api/v1/does-not-exist');
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, 'NOT_FOUND');
  assert.equal(typeof res.body.error.message, 'string');
  assert.ok(Array.isArray(res.body.error.details));
  ctx.cleanup();
});

test('unknown non-API route returns 404 with error envelope', async () => {
  const ctx = createTestContext();
  const res = await ctx.request(ctx.app).get('/no-such-page');
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, 'NOT_FOUND');
  ctx.cleanup();
});

test('malformed JSON body returns 400 INVALID_JSON', async () => {
  const ctx = createTestContext();
  const res = await ctx
    .request(ctx.app)
    .post('/api/v1/health')
    .set('Content-Type', 'application/json')
    .send('{"broken": ');
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'INVALID_JSON');
  assert.ok(Array.isArray(res.body.error.details));
  ctx.cleanup();
});

test('error responses always use the standard envelope shape', async () => {
  const ctx = createTestContext();

  const assertEnvelope = (body) => {
    assert.equal(typeof body.error, 'object');
    assert.equal(typeof body.error.code, 'string');
    assert.equal(typeof body.error.message, 'string');
    assert.ok(Array.isArray(body.error.details));
    assert.equal('data' in body, false);
  };

  const notFound = await ctx.request(ctx.app).get('/api/v1/nope');
  assert.equal(notFound.status, 404);
  assertEnvelope(notFound.body);

  const badJson = await ctx
    .request(ctx.app)
    .post('/api/v1/health')
    .set('Content-Type', 'application/json')
    .send('{');
  assert.equal(badJson.status, 400);
  assertEnvelope(badJson.body);

  ctx.cleanup();
});
