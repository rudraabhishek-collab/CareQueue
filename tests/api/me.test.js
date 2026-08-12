import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext } from '../helpers/context.js';
import { signToken, insertUser } from '../helpers/auth.js';
import { hashPassword } from '../../backend/utils/password.js';

async function registerAndGetToken(ctx, phone = '9999999999') {
  const res = await ctx
    .request(ctx.app)
    .post('/api/v1/auth/register')
    .send({ name: 'Demo Patient', phone, password: 'StrongPassword123' });
  assert.equal(res.status, 201);
  return res.body.data.token;
}

test('authenticated patient sees their user and patient profile', async () => {
  const ctx = createTestContext();
  const token = await registerAndGetToken(ctx);

  const res = await ctx
    .request(ctx.app)
    .get('/api/v1/auth/me')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.user.role, 'patient');
  assert.ok(res.body.data.patient, 'patient profile included');
  assert.equal(res.body.data.patient.phone, '+919999999999');
  assert.ok(!('password_hash' in res.body.data.user), 'password_hash never returned');
  ctx.cleanup();
});

test('authenticated doctor sees their identity without a patient profile', async () => {
  const ctx = createTestContext();
  const hash = await hashPassword('DoctorPass123!');
  const user = insertUser(ctx.db, {
    phone: '+919000000002',
    role: 'doctor',
    name: 'Demo Doctor',
    passwordHash: hash,
  });
  const token = signToken({ sub: user.id, role: user.role });

  const res = await ctx
    .request(ctx.app)
    .get('/api/v1/auth/me')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.user.role, 'doctor');
  assert.equal(res.body.data.user.name, 'Demo Doctor');
  assert.ok(
    !('patient' in res.body.data) || res.body.data.patient === undefined,
    'no patient profile'
  );
  ctx.cleanup();
});

test('authenticated staff sees their identity', async () => {
  const ctx = createTestContext();
  const user = insertUser(ctx.db, { phone: '+919000000003', role: 'staff', name: 'Demo Staff' });
  const token = signToken({ sub: user.id, role: user.role });

  const res = await ctx
    .request(ctx.app)
    .get('/api/v1/auth/me')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.user.role, 'staff');
  assert.equal(res.body.data.user.name, 'Demo Staff');
  ctx.cleanup();
});

test('authenticated admin sees their identity', async () => {
  const ctx = createTestContext();
  const user = insertUser(ctx.db, { phone: '+919000000004', role: 'admin', name: 'Demo Admin' });
  const token = signToken({ sub: user.id, role: user.role });

  const res = await ctx
    .request(ctx.app)
    .get('/api/v1/auth/me')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.user.role, 'admin');
  ctx.cleanup();
});

test('unauthenticated /auth/me request is rejected with 401', async () => {
  const ctx = createTestContext();
  const res = await ctx.request(ctx.app).get('/api/v1/auth/me');
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'UNAUTHORIZED');
  ctx.cleanup();
});
