import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext } from '../helpers/context.js';
import { insertUser, signToken } from '../helpers/auth.js';

/**
 * Registers a fresh patient account via the public API.
 */
function registerPatient(ctx, overrides = {}) {
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

async function registerAndToken(ctx, overrides = {}) {
  const res = await registerPatient(ctx, overrides);
  return res.body.data;
}

/**
 * Creates a user directly (no patient profile) and returns a valid token.
 */
function directPatientToken(ctx, phone = '+919910000111') {
  const user = insertUser(ctx.db, { phone, role: 'patient', name: 'Direct Patient' });
  return signToken({ sub: user.id, role: 'patient' });
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

test('GET /patients/me returns the registered patient profile', async () => {
  const ctx = createTestContext();
  const { token, user } = await registerAndToken(ctx);

  const res = await ctx.request(ctx.app).get('/api/v1/patients/me').set(auth(token));

  assert.equal(res.status, 200);
  const { patient, recentTriage } = res.body.data;
  assert.equal(patient.id, 1);
  assert.equal(patient.userId, user.id);
  assert.equal(patient.name, 'Demo Patient');
  assert.equal(patient.phone, '+919999999999');
  assert.ok(patient.createdAt, 'createdAt present');
  assert.ok(patient.updatedAt, 'updatedAt present');
  assert.equal(patient.age, null);
  assert.equal(patient.gender, null);
  assert.equal(patient.abhaId, null);
  assert.deepEqual(recentTriage, []);
  assert.ok(!('password_hash' in patient), 'password_hash never returned');

  ctx.cleanup();
});

test('GET /patients/me returns 404 PATIENT_NOT_FOUND without a profile', async () => {
  const ctx = createTestContext();
  const token = directPatientToken(ctx);

  const res = await ctx.request(ctx.app).get('/api/v1/patients/me').set(auth(token));

  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, 'PATIENT_NOT_FOUND');
  ctx.cleanup();
});

test('POST /patients creates a profile (phone defaults to the account phone)', async () => {
  const ctx = createTestContext();
  const token = directPatientToken(ctx);

  const res = await ctx
    .request(ctx.app)
    .post('/api/v1/patients')
    .set(auth(token))
    .send({ name: 'New Profile', age: 30, gender: 'female' });

  assert.equal(res.status, 201);
  const { patient } = res.body.data;
  assert.equal(patient.name, 'New Profile');
  assert.equal(patient.age, 30);
  assert.equal(patient.gender, 'female');
  assert.equal(patient.phone, '+919910000111', 'phone falls back to the account phone');
  assert.ok(patient.updatedAt, 'updatedAt set on create');
  assert.ok(!('recentTriage' in res.body.data), 'create response returns the patient only');

  const me = await ctx.request(ctx.app).get('/api/v1/patients/me').set(auth(token));
  assert.equal(me.status, 200);
  assert.equal(me.body.data.patient.id, patient.id);
  ctx.cleanup();
});

test('POST /patients returns 409 PATIENT_EXISTS when a profile already exists', async () => {
  const ctx = createTestContext();
  const { token } = await registerAndToken(ctx);

  const res = await ctx
    .request(ctx.app)
    .post('/api/v1/patients')
    .set(auth(token))
    .send({ name: 'Xavier' });

  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'PATIENT_EXISTS');
  ctx.cleanup();
});

test('POST /patients normalizes a provided phone', async () => {
  const ctx = createTestContext();
  const token = directPatientToken(ctx, '+919910000222');

  const res = await ctx
    .request(ctx.app)
    .post('/api/v1/patients')
    .set(auth(token))
    .send({ name: 'Normalized', phone: '9991000222' });

  assert.equal(res.status, 201);
  assert.equal(res.body.data.patient.phone, '+919991000222');
  ctx.cleanup();
});

test('POST /patients validates name, age and gender', async () => {
  const ctx = createTestContext();
  const token = directPatientToken(ctx, '+919910000333');

  const invalid = [
    { name: 'A' },
    { name: 'Ok Name', age: 121 },
    { name: 'Ok Name', age: -1 },
    { name: 'Ok Name', age: 1.5 },
    { name: 'Ok Name', gender: '' },
    { name: 'Ok Name', gender: 'x'.repeat(21) },
    { name: 'Ok Name', phone: '1234567890' },
  ];

  for (const body of invalid) {
    const res = await ctx.request(ctx.app).post('/api/v1/patients').set(auth(token)).send(body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(res.body.error.code, 'VALIDATION_ERROR', JSON.stringify(body));
  }

  ctx.cleanup();
});

test('PATCH /patients/me updates profile fields', async () => {
  const ctx = createTestContext();
  const { token, user } = await registerAndToken(ctx);

  const res = await ctx
    .request(ctx.app)
    .patch('/api/v1/patients/me')
    .set(auth(token))
    .send({ name: 'Updated Name', age: 45, gender: 'male' });

  assert.equal(res.status, 200);
  const { patient } = res.body.data;
  assert.equal(patient.name, 'Updated Name');
  assert.equal(patient.age, 45);
  assert.equal(patient.gender, 'male');
  assert.equal(patient.userId, user.id, 'userId is immutable in practice');
  assert.ok(!('recentTriage' in res.body.data), 'patch response returns the patient only');

  const me = await ctx.request(ctx.app).get('/api/v1/patients/me').set(auth(token));
  assert.equal(me.body.data.patient.name, 'Updated Name');
  ctx.cleanup();
});

test('PATCH /patients/me rejects immutable and unknown fields', async () => {
  const ctx = createTestContext();
  const { token } = await registerAndToken(ctx);

  for (const body of [{ role: 'admin' }, { id: 999 }, { userId: 1 }, { createdAt: 'x' }]) {
    const res = await ctx.request(ctx.app).patch('/api/v1/patients/me').set(auth(token)).send(body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(res.body.error.code, 'VALIDATION_ERROR', JSON.stringify(body));
  }

  ctx.cleanup();
});

test('PATCH /patients/me rejects an empty body', async () => {
  const ctx = createTestContext();
  const { token } = await registerAndToken(ctx);

  const res = await ctx.request(ctx.app).patch('/api/v1/patients/me').set(auth(token)).send({});

  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  ctx.cleanup();
});

test('PATCH /patients/me returns 404 PATIENT_NOT_FOUND without a profile', async () => {
  const ctx = createTestContext();
  const token = directPatientToken(ctx);

  const res = await ctx
    .request(ctx.app)
    .patch('/api/v1/patients/me')
    .set(auth(token))
    .send({ name: 'Xavier' });

  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, 'PATIENT_NOT_FOUND');
  ctx.cleanup();
});

test('PATCH /patients/me validates age and gender', async () => {
  const ctx = createTestContext();
  const { token } = await registerAndToken(ctx);

  for (const body of [
    { age: 121 },
    { age: -1 },
    { age: 1.5 },
    { gender: '' },
    { gender: 'y'.repeat(21) },
  ]) {
    const res = await ctx.request(ctx.app).patch('/api/v1/patients/me').set(auth(token)).send(body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(res.body.error.code, 'VALIDATION_ERROR', JSON.stringify(body));
  }

  ctx.cleanup();
});

test('PATCH /patients/me updates phone via the shared phone validation', async () => {
  const ctx = createTestContext();
  const { token } = await registerAndToken(ctx);

  const res = await ctx
    .request(ctx.app)
    .patch('/api/v1/patients/me')
    .set(auth(token))
    .send({ phone: '9991118888' });

  assert.equal(res.status, 200);
  assert.equal(res.body.data.patient.phone, '+919991118888');

  const bad = await ctx
    .request(ctx.app)
    .patch('/api/v1/patients/me')
    .set(auth(token))
    .send({ phone: '1234567890' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, 'VALIDATION_ERROR');
  ctx.cleanup();
});

test('PATCH /patients/me returns 409 PHONE_IN_USE for a phone owned by another patient', async () => {
  const ctx = createTestContext();
  await registerAndToken(ctx, { phone: '9992220001' });
  const { token: tokenB } = await registerAndToken(ctx, { phone: '9992220002' });

  const res = await ctx
    .request(ctx.app)
    .patch('/api/v1/patients/me')
    .set(auth(tokenB))
    .send({ phone: '9992220001' });

  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'PHONE_IN_USE');

  const me = await ctx.request(ctx.app).get('/api/v1/patients/me').set(auth(tokenB));
  assert.equal(me.body.data.patient.phone, '+919992220002', 'conflicting phone not applied');
  ctx.cleanup();
});

test('GET /patients/me includes recent triage without description or breakdown', async () => {
  const ctx = createTestContext();
  const { token } = await registerAndToken(ctx);

  await ctx
    .request(ctx.app)
    .post('/api/v1/triage/assess')
    .set(auth(token))
    .send({ symptoms: ['fever'], description: 'mild fever since yesterday' });

  const res = await ctx.request(ctx.app).get('/api/v1/patients/me').set(auth(token));

  assert.equal(res.status, 200);
  assert.equal(res.body.data.recentTriage.length, 1);
  const item = res.body.data.recentTriage[0];
  assert.deepEqual(Object.keys(item).sort(), [
    'careLevel',
    'createdAt',
    'id',
    'isEmergency',
    'priority',
    'score',
    'severity',
  ]);
  assert.equal(item.severity, 'MILD');
  assert.equal(item.priority, 3);
  assert.equal(item.careLevel, 'PHC');
  assert.equal(item.isEmergency, false);
  assert.ok(!('description' in item), 'description is never exposed');
  assert.ok(!('score_breakdown' in item), 'score_breakdown is never exposed');
  assert.ok(!('patient_id' in item), 'patient_id is never exposed');
  ctx.cleanup();
});

test('recent triage is newest-first and capped at 5', async () => {
  const ctx = createTestContext();
  const { token } = await registerAndToken(ctx);

  for (let i = 0; i < 6; i += 1) {
    const res = await ctx
      .request(ctx.app)
      .post('/api/v1/triage/assess')
      .set(auth(token))
      .send({ symptoms: ['fever'] });
    assert.equal(res.status, 200, `assessment ${i} created`);
  }

  const allIds = ctx.db
    .prepare('SELECT id FROM triage_assessments ORDER BY id')
    .all()
    .map((row) => row.id);

  const res = await ctx.request(ctx.app).get('/api/v1/patients/me').set(auth(token));
  const ids = res.body.data.recentTriage.map((item) => item.id);

  assert.equal(ids.length, 5);
  assert.deepEqual(ids, allIds.slice(-5).reverse(), 'newest five, newest first');
  ctx.cleanup();
});

test('patient module writes audit events without sensitive data', async () => {
  const ctx = createTestContext();
  const token = directPatientToken(ctx, '+919910000444');

  const created = await ctx
    .request(ctx.app)
    .post('/api/v1/patients')
    .set(auth(token))
    .send({ name: 'Audited Patient' });
  assert.equal(created.status, 201);

  const createAudit = ctx.db
    .prepare("SELECT * FROM audit_logs WHERE action = 'PATIENT_CREATED'")
    .get();
  assert.ok(createAudit, 'PATIENT_CREATED recorded');
  assert.equal(createAudit.entity_type, 'patient');
  assert.equal(createAudit.entity_id, String(created.body.data.patient.id));

  await ctx.request(ctx.app).patch('/api/v1/patients/me').set(auth(token)).send({ age: 55 });

  const updateAudit = ctx.db
    .prepare("SELECT * FROM audit_logs WHERE action = 'PATIENT_UPDATED'")
    .get();
  assert.ok(updateAudit, 'PATIENT_UPDATED recorded');
  const meta = JSON.parse(updateAudit.meta);
  assert.deepEqual(meta.changed, ['age']);

  ctx.cleanup();
});
