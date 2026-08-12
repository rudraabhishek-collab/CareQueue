import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext } from '../helpers/context.js';

test('GET / serves the frontend application', async () => {
  const ctx = createTestContext();
  const res = await ctx.request(ctx.app).get('/');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /text\/html/);
  assert.match(res.text, /CareQueue/);
  ctx.cleanup();
});

test('GET /styles.css serves the extracted stylesheet', async () => {
  const ctx = createTestContext();
  const res = await ctx.request(ctx.app).get('/styles.css');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /text\/css/);
  assert.match(res.text, /--bg-light/);
  ctx.cleanup();
});

test('GET /app.js serves the application script', async () => {
  const ctx = createTestContext();
  const res = await ctx.request(ctx.app).get('/app.js');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /javascript/);
  assert.match(res.text, /apiRequest/);
  ctx.cleanup();
});
