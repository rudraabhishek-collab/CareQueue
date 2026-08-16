import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext } from '../helpers/context.js';
import { insertUser, signToken } from '../helpers/auth.js';

function register(ctx, overrides = {}) {
  return ctx
    .request(ctx.app)
    .post('/api/v1/auth/register')
    .send({
      name: 'Demo Patient',
      phone: '9999999999',
      password: 'StrongPassword123',
      ...overrides,
    });
}

async function registerAndToken(ctx, phone) {
  const res = await register(ctx, { phone });
  return res.body.data;
}

function roleToken(ctx, { role, phone }) {
  const user = insertUser(ctx.db, { phone, role, name: `${role} User` });
  return signToken({ sub: user.id, role });
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

test('patients endpoints require authentication', async () => {
  const ctx = createTestContext();

  const get = await ctx.request(ctx.app).get('/api/v1/patients/me');
  const post = await ctx.request(ctx.app).post('/api/v1/patients').send({ name: 'X' });
  const patch = await ctx.request(ctx.app).patch('/api/v1/patients/me').send({ name: 'X' });

  for (const res of [get, post, patch]) {
    assert.equal(res.status, 401, `${res.req.method} ${res.req.path}`);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
  }

  ctx.cleanup();
});

test('invalid or expired tokens are rejected with 401', async () => {
  const ctx = createTestContext();

  const garbage = await ctx.request(ctx.app).get('/api/v1/patients/me').set(auth('not-a-jwt'));
  assert.equal(garbage.status, 401);

  const expired = await ctx
    .request(ctx.app)
    .get('/api/v1/patients/me')
    .set(auth(signToken({ sub: 1, role: 'patient', expiresIn: '-1h' })));
  assert.equal(expired.status, 401);

  ctx.cleanup();
});

test('doctor, staff and admin cannot access patients endpoints', async () => {
  const ctx = createTestContext();

  for (const role of ['doctor', 'staff', 'admin']) {
    const token = roleToken(ctx, { role, phone: `+9199${role}000001` });

    const get = await ctx.request(ctx.app).get('/api/v1/patients/me').set(auth(token));
    const post = await ctx
      .request(ctx.app)
      .post('/api/v1/patients')
      .set(auth(token))
      .send({ name: 'X' });
    const patch = await ctx
      .request(ctx.app)
      .patch('/api/v1/patients/me')
      .set(auth(token))
      .send({ name: 'X' });

    for (const res of [get, post, patch]) {
      assert.equal(res.status, 403, `${role}: ${res.req.method} ${res.req.path}`);
      assert.equal(res.body.error.code, 'FORBIDDEN', `${role} blocked`);
    }
  }

  ctx.cleanup();
});

test('a spoofed patient role claim cannot bypass the database role', async () => {
  const ctx = createTestContext();
  const doctor = insertUser(ctx.db, { phone: '+9199doctor0002', role: 'doctor' });

  const token = signToken({ sub: doctor.id, role: 'patient' });
  const res = await ctx.request(ctx.app).get('/api/v1/patients/me').set(auth(token));

  assert.equal(res.status, 403, 'DB role is authoritative, not the token claim');
  assert.equal(res.body.error.code, 'FORBIDDEN');
  ctx.cleanup();
});

test('patients only ever see and mutate their own profile', async () => {
  const ctx = createTestContext();
  const a = await registerAndToken(ctx, '9991110001');
  const b = await registerAndToken(ctx, '9991110002');

  const bRes = await ctx
    .request(ctx.app)
    .patch('/api/v1/patients/me')
    .set(auth(b.token))
    .send({ name: 'Patient B Name' });
  assert.equal(bRes.status, 200);

  const aMe = await ctx.request(ctx.app).get('/api/v1/patients/me').set(auth(a.token));
  assert.equal(aMe.status, 200);
  assert.equal(aMe.body.data.patient.userId, a.user.id);
  assert.equal(aMe.body.data.patient.name, 'Demo Patient', 'A never sees B profile fields');
  assert.equal(aMe.body.data.patient.phone, '+919991110001');

  const aPatch = await ctx
    .request(ctx.app)
    .patch('/api/v1/patients/me')
    .set(auth(a.token))
    .send({ name: 'Patient A Name' });
  assert.equal(aPatch.status, 200);

  const bMe = await ctx.request(ctx.app).get('/api/v1/patients/me').set(auth(b.token));
  assert.equal(bMe.body.data.patient.name, 'Patient B Name', 'B profile untouched by A');

  ctx.cleanup();
});

test('recent triage is scoped to the requesting patient only', async () => {
  const ctx = createTestContext();
  const a = await registerAndToken(ctx, '9992220001');
  const b = await registerAndToken(ctx, '9992220002');

  await ctx
    .request(ctx.app)
    .post('/api/v1/triage/assess')
    .set(auth(b.token))
    .send({ symptoms: ['fever'] });

  const aMe = await ctx.request(ctx.app).get('/api/v1/patients/me').set(auth(a.token));
  assert.deepEqual(aMe.body.data.recentTriage, [], 'A does not see B triage history');

  const bMe = await ctx.request(ctx.app).get('/api/v1/patients/me').set(auth(b.token));
  assert.equal(bMe.body.data.recentTriage.length, 1);
  ctx.cleanup();
});
