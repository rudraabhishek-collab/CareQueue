import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext } from '../helpers/context.js';
import { signToken, insertUser } from '../helpers/auth.js';

function me(ctx, token) {
  const req = ctx.request(ctx.app).get('/api/v1/auth/me');
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
}

test('valid token is accepted and returns the authenticated patient', async () => {
  const ctx = createTestContext();
  const reg = await ctx
    .request(ctx.app)
    .post('/api/v1/auth/register')
    .send({ name: 'Demo Patient', phone: '9999999999', password: 'StrongPassword123' });

  const res = await me(ctx, reg.body.data.token);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.user.role, 'patient');
  ctx.cleanup();
});

test('missing token is rejected with 401', async () => {
  const ctx = createTestContext();
  const res = await me(ctx, null);
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'UNAUTHORIZED');
  ctx.cleanup();
});

test('malformed Authorization header is rejected with 401', async () => {
  const ctx = createTestContext();
  for (const header of ['Token abc', 'Bearer', 'Basic abc', 'bearer abc', '']) {
    const req = ctx.request(ctx.app).get('/api/v1/auth/me');
    const res = header ? await req.set('Authorization', header) : await req;
    assert.equal(res.status, 401, `header "${header}"`);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
  }
  ctx.cleanup();
});

test('malformed token is rejected with 401', async () => {
  const ctx = createTestContext();
  const res = await me(ctx, 'not-a-jwt.at.all');
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'UNAUTHORIZED');
  ctx.cleanup();
});

test('expired token is rejected with 401', async () => {
  const ctx = createTestContext();
  const user = insertUser(ctx.db, { phone: '+919999999901', role: 'patient' });
  const token = signToken({ sub: user.id, role: user.role, expiresIn: -10 });
  const res = await me(ctx, token);
  assert.equal(res.status, 401);
  ctx.cleanup();
});

test('token signed with a different secret is rejected with 401', async () => {
  const ctx = createTestContext();
  const user = insertUser(ctx.db, { phone: '+919999999902', role: 'patient' });
  const token = signToken({ sub: user.id, role: user.role, secret: 'a-different-secret' });
  const res = await me(ctx, token);
  assert.equal(res.status, 401);
  ctx.cleanup();
});

test('token missing sub claim is rejected with 401', async () => {
  const ctx = createTestContext();
  const { default: jwt } = await import('jsonwebtoken');
  const token = jwt.sign({ role: 'patient' }, 'test-secret-not-for-production', {
    expiresIn: '1h',
  });
  const res = await me(ctx, token);
  assert.equal(res.status, 401);
  ctx.cleanup();
});

test('token missing role claim is rejected with 401', async () => {
  const ctx = createTestContext();
  const user = insertUser(ctx.db, { phone: '+919999999903', role: 'patient' });
  const { default: jwt } = await import('jsonwebtoken');
  const token = jwt.sign({}, 'test-secret-not-for-production', {
    subject: String(user.id),
    expiresIn: '1h',
  });
  const res = await me(ctx, token);
  assert.equal(res.status, 401);
  ctx.cleanup();
});

test('deleted user is rejected with 401', async () => {
  const ctx = createTestContext();
  const reg = await ctx
    .request(ctx.app)
    .post('/api/v1/auth/register')
    .send({ name: 'Gone Patient', phone: '9999999999', password: 'StrongPassword123' });
  const token = reg.body.data.token;
  const { id } = reg.body.data.user;

  ctx.db.prepare('DELETE FROM audit_logs WHERE actor_user_id = ?').run(id);
  ctx.db.prepare('DELETE FROM patients WHERE user_id = ?').run(id);
  ctx.db.prepare('DELETE FROM users WHERE id = ?').run(id);

  const res = await me(ctx, token);
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'UNAUTHORIZED');
  ctx.cleanup();
});

test('authorization is always derived from the database role, not the token role', async () => {
  const ctx = createTestContext();
  // Token claims role=admin, but the database row says patient.
  const user = insertUser(ctx.db, { phone: '+919999999904', role: 'patient' });
  const token = signToken({ sub: user.id, role: 'admin' });

  const res = await me(ctx, token);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.user.role, 'patient', 'database role wins');
  ctx.cleanup();
});
