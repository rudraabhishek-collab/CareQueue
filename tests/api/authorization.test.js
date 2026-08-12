import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext } from '../helpers/context.js';
import { signToken, insertUser } from '../helpers/auth.js';

function tokenFor(ctx, phone, role) {
  const user = insertUser(ctx.db, { phone, role, name: `Demo ${role}` });
  return signToken({ sub: user.id, role: user.role });
}

async function call(ctx, token, role) {
  const req = ctx.request(ctx.app).get(`/api/v1/_dev/roles/${role}`);
  return req.set('Authorization', `Bearer ${token}`);
}

test('patient cannot access a doctor-only endpoint (403)', async () => {
  const ctx = createTestContext();
  const token = tokenFor(ctx, '+919999999901', 'patient');
  const res = await call(ctx, token, 'doctor');
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'FORBIDDEN');
  ctx.cleanup();
});

test('doctor cannot access an admin-only endpoint (403)', async () => {
  const ctx = createTestContext();
  const token = tokenFor(ctx, '+919999999902', 'doctor');
  const res = await call(ctx, token, 'admin');
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'FORBIDDEN');
  ctx.cleanup();
});

test('staff cannot access an admin-only endpoint (403)', async () => {
  const ctx = createTestContext();
  const token = tokenFor(ctx, '+919999999903', 'staff');
  const res = await call(ctx, token, 'admin');
  assert.equal(res.status, 403);
  ctx.cleanup();
});

test('admin can access an admin-only endpoint (200)', async () => {
  const ctx = createTestContext();
  const token = tokenFor(ctx, '+919999999904', 'admin');
  const res = await call(ctx, token, 'admin');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { data: { allowed: true } });
  ctx.cleanup();
});

test('patient can access a patient-only endpoint (200)', async () => {
  const ctx = createTestContext();
  const token = tokenFor(ctx, '+919999999905', 'patient');
  const res = await call(ctx, token, 'patient');
  assert.equal(res.status, 200);
  ctx.cleanup();
});

test('doctor can access a multi-role (doctor|staff) endpoint (200)', async () => {
  const ctx = createTestContext();
  const token = tokenFor(ctx, '+919999999906', 'doctor');
  const res = await call(ctx, token, 'doctor-staff');
  assert.equal(res.status, 200);
  ctx.cleanup();
});

test('staff can access a multi-role (doctor|staff) endpoint (200)', async () => {
  const ctx = createTestContext();
  const token = tokenFor(ctx, '+919999999907', 'staff');
  const res = await call(ctx, token, 'doctor-staff');
  assert.equal(res.status, 200);
  ctx.cleanup();
});

test('patient cannot access a multi-role (doctor|staff) endpoint (403)', async () => {
  const ctx = createTestContext();
  const token = tokenFor(ctx, '+919999999908', 'patient');
  const res = await call(ctx, token, 'doctor-staff');
  assert.equal(res.status, 403);
  ctx.cleanup();
});

test('role endpoints are not mounted in production', async () => {
  const ctx = createTestContext({ nodeEnv: 'production' });
  const token = tokenFor(ctx, '+919999999909', 'admin');
  const req = ctx.request(ctx.app).get('/api/v1/_dev/roles/admin');
  const res = await req.set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 404, 'dev endpoints must not exist in production');
  ctx.cleanup();
});
