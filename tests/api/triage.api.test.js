import test from 'node:test';
import assert from 'node:assert/strict';
import { signToken, insertUser } from '../helpers/auth.js';
import { createTestContext } from '../helpers/context.js';

test('POST /api/v1/triage/assess: authenticated patient with valid symptom', async () => {
  const ctx = createTestContext();
  // Register a patient
  await ctx.request(ctx.app).post('/api/v1/auth/register').send({
    name: 'Demo Patient',
    phone: '9999999999',
    password: 'StrongPassword123',
  });

  const token = signToken({ sub: 1, role: 'patient' });

  const res = await ctx
    .request(ctx.app)
    .post('/api/v1/triage/assess')
    .set('Authorization', `Bearer ${token}`)
    .send({ symptoms: ['fever'], description: 'Mild fever', age: 21 });

  assert.equal(res.status, 200);
  assert.ok(res.body.data.assessment);
  assert.strictEqual(res.body.data.assessment.severity, 'MILD');
  assert.strictEqual(res.body.data.assessment.priority, 3);
  assert.strictEqual(res.body.data.assessment.score, 20);
  assert.strictEqual(res.body.data.assessment.isEmergency, false);
  assert.strictEqual(res.body.data.assessment.careLevel, 'PHC');
  assert.ok(res.body.data.assessment.disclaimer.includes('not a medical diagnosis'));
  ctx.cleanup();
});

test('POST /api/v1/triage/assess: authenticated patient with multiple symptoms', async () => {
  const ctx = createTestContext();
  await ctx.request(ctx.app).post('/api/v1/auth/register').send({
    name: 'Demo Patient 2',
    phone: '9999888888',
    password: 'StrongPassword123',
  });

  const user = ctx.db.prepare('SELECT id FROM users WHERE phone = ?').get('+919999888888');
  const token = signToken({ sub: user.id, role: 'patient' });

  const res = await ctx
    .request(ctx.app)
    .post('/api/v1/triage/assess')
    .set('Authorization', `Bearer ${token}`)
    .send({ symptoms: ['fever', 'cough'], description: 'Fever and cough', age: 30 });

  assert.equal(res.status, 200);
  assert.strictEqual(res.body.data.assessment.severity, 'MODERATE');
  assert.strictEqual(res.body.data.assessment.score, 30); // 20 + 10
  assert.strictEqual(res.body.data.assessment.priority, 2);
  ctx.cleanup();
});

test('POST /api/v1/triage/assess: persistence - assessment saved to database', async () => {
  const ctx = createTestContext();
  await ctx.request(ctx.app).post('/api/v1/auth/register').send({
    name: 'Demo Patient 3',
    phone: '9999777777',
    password: 'StrongPassword123',
  });

  const user = ctx.db.prepare('SELECT id FROM users WHERE phone = ?').get('+919999777777');
  const token = signToken({ sub: user.id, role: 'patient' });

  await ctx
    .request(ctx.app)
    .post('/api/v1/triage/assess')
    .set('Authorization', `Bearer ${token}`)
    .send({ symptoms: ['fever'], description: 'Test fever', age: 21 });

  // Check that assessment was persisted
  const assessments = ctx.db
    .prepare('SELECT * FROM triage_assessments WHERE patient_id = ?')
    .all(user.id);
  assert.ok(assessments.length >= 1, 'Assessment must be persisted');
  assert.strictEqual(assessments[0].symptom_codes, JSON.stringify(['fever']));
  assert.strictEqual(assessments[0].severity, 'MILD');
  assert.strictEqual(assessments[0].is_emergency, 0);
  ctx.cleanup();
});

test('POST /api/v1/triage/assess: unauthenticated → 401', async () => {
  const ctx = createTestContext();

  const res = await ctx
    .request(ctx.app)
    .post('/api/v1/triage/assess')
    .send({ symptoms: ['fever'], description: 'Test', age: 21 });

  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'UNAUTHORIZED');
  ctx.cleanup();
});

test('POST /api/v1/triage/assess: doctor → 403', async () => {
  const ctx = createTestContext();

  // Insert a doctor user directly (no patient profile)
  const user = insertUser(ctx.db, {
    phone: '+919999000001',
    role: 'doctor',
    name: 'Doctor User',
  });
  const token = signToken({ sub: user.id, role: 'doctor' });

  const res = await ctx
    .request(ctx.app)
    .post('/api/v1/triage/assess')
    .set('Authorization', `Bearer ${token}`)
    .send({ symptoms: ['fever'], description: 'Test', age: 21 });

  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'FORBIDDEN');
  ctx.cleanup();
});

test('POST /api/v1/triage/assess: staff → 403', async () => {
  const ctx = createTestContext();

  // Insert a staff user directly (no patient profile)
  const user = insertUser(ctx.db, {
    phone: '+919999000002',
    role: 'staff',
    name: 'Staff User',
  });
  const token = signToken({ sub: user.id, role: 'staff' });

  const res = await ctx
    .request(ctx.app)
    .post('/api/v1/triage/assess')
    .set('Authorization', `Bearer ${token}`)
    .send({ symptoms: ['fever'], description: 'Test', age: 21 });

  assert.equal(res.status, 403);
  ctx.cleanup();
});

test('POST /api/v1/triage/assess: admin → 403', async () => {
  const ctx = createTestContext();

  // Insert an admin user directly (no patient profile)
  const user = insertUser(ctx.db, {
    phone: '+919999000003',
    role: 'admin',
    name: 'Admin User',
  });
  const token = signToken({ sub: user.id, role: 'admin' });

  const res = await ctx
    .request(ctx.app)
    .post('/api/v1/triage/assess')
    .set('Authorization', `Bearer ${token}`)
    .send({ symptoms: ['fever'], description: 'Test', age: 21 });

  assert.equal(res.status, 403);
  ctx.cleanup();
});

test('POST /api/v1/triage/assess: unknown symptom → 422', async () => {
  const ctx = createTestContext();
  await ctx.request(ctx.app).post('/api/v1/auth/register').send({
    name: 'Test User',
    phone: '9999000004',
    password: 'StrongPassword123',
  });

  const user = ctx.db.prepare('SELECT id FROM users WHERE phone = ?').get('+919999000004');
  const token = signToken({ sub: user.id, role: 'patient' });

  const res = await ctx
    .request(ctx.app)
    .post('/api/v1/triage/assess')
    .set('Authorization', `Bearer ${token}`)
    .send({ symptoms: ['unknown_code'], description: 'Test', age: 21 });

  assert.equal(res.status, 422);
  assert.equal(res.body.error.code, 'UNKNOWN_SYMPTOM');
  ctx.cleanup();
});

test('POST /api/v1/triage/assess: missing symptoms → 400', async () => {
  const ctx = createTestContext();
  await ctx.request(ctx.app).post('/api/v1/auth/register').send({
    name: 'Test User',
    phone: '9999000005',
    password: 'StrongPassword123',
  });

  const user = ctx.db.prepare('SELECT id FROM users WHERE phone = ?').get('+919999000005');
  const token = signToken({ sub: user.id, role: 'patient' });

  const res = await ctx
    .request(ctx.app)
    .post('/api/v1/triage/assess')
    .set('Authorization', `Bearer ${token}`)
    .send({ description: 'Test', age: 21 });

  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  ctx.cleanup();
});

test('POST /api/v1/triage/assess: description > 500 → 400', async () => {
  const ctx = createTestContext();
  await ctx.request(ctx.app).post('/api/v1/auth/register').send({
    name: 'Test User',
    phone: '9999000006',
    password: 'StrongPassword123',
  });

  const user = ctx.db.prepare('SELECT id FROM users WHERE phone = ?').get('+919999000006');
  const token = signToken({ sub: user.id, role: 'patient' });

  const res = await ctx
    .request(ctx.app)
    .post('/api/v1/triage/assess')
    .set('Authorization', `Bearer ${token}`)
    .send({ symptoms: ['fever'], description: 'A'.repeat(501), age: 21 });

  assert.equal(res.status, 400);
  ctx.cleanup();
});

test('POST /api/v1/triage/assess: invalid age → 400', async () => {
  const ctx = createTestContext();
  await ctx.request(ctx.app).post('/api/v1/auth/register').send({
    name: 'Test User',
    phone: '9999000007',
    password: 'StrongPassword123',
  });

  const user = ctx.db.prepare('SELECT id FROM users WHERE phone = ?').get('+919999000007');
  const token = signToken({ sub: user.id, role: 'patient' });

  const res = await ctx
    .request(ctx.app)
    .post('/api/v1/triage/assess')
    .set('Authorization', `Bearer ${token}`)
    .send({ symptoms: ['fever'], age: -5 });

  assert.equal(res.status, 400);
  ctx.cleanup();
});

test('POST /api/v1/triage/assess: missing patient profile → error', async () => {
  const ctx = createTestContext();
  // Insert a user without a patient profile
  ctx.db
    .prepare('INSERT INTO users (phone, password_hash, role, name) VALUES (?, ?, ?, ?)')
    .run('+919999000008', '$2a$12$dummy', 'patient', 'No Profile Patient');
  const user = ctx.db.prepare('SELECT id FROM users WHERE phone = ?').get('+919999000008');
  const token = signToken({ sub: user.id, role: 'patient' });

  const res = await ctx
    .request(ctx.app)
    .post('/api/v1/triage/assess')
    .set('Authorization', `Bearer ${token}`)
    .send({ symptoms: ['fever'], description: 'Test', age: 21 });

  // Should fail because no patient profile exists
  assert.equal(res.status, 404);
  ctx.cleanup();
});

test('POST /api/v1/triage/assess: emergency assessment - chest pain', async () => {
  const ctx = createTestContext();
  await ctx.request(ctx.app).post('/api/v1/auth/register').send({
    name: 'Emergency Test',
    phone: '9999000009',
    password: 'StrongPassword123',
  });

  const user = ctx.db.prepare('SELECT id FROM users WHERE phone = ?').get('+919999000009');
  const token = signToken({ sub: user.id, role: 'patient' });

  const res = await ctx
    .request(ctx.app)
    .post('/api/v1/triage/assess')
    .set('Authorization', `Bearer ${token}`)
    .send({ symptoms: ['chest'], description: 'Chest pain', age: 45 });

  assert.equal(res.status, 200);
  assert.strictEqual(res.body.data.assessment.isEmergency, true);
  assert.strictEqual(res.body.data.assessment.severity, 'EMERGENCY');
  assert.strictEqual(res.body.data.assessment.priority, 0);
  assert.strictEqual(res.body.data.assessment.careLevel, 'EMERGENCY');
  ctx.cleanup();
});

test('POST /api/v1/triage/assess: emergency from description keyword', async () => {
  const ctx = createTestContext();
  await ctx.request(ctx.app).post('/api/v1/auth/register').send({
    name: 'Keyword Test',
    phone: '9999000010',
    password: 'StrongPassword123',
  });

  const user = ctx.db.prepare('SELECT id FROM users WHERE phone = ?').get('+919999000010');
  const token = signToken({ sub: user.id, role: 'patient' });

  const res = await ctx
    .request(ctx.app)
    .post('/api/v1/triage/assess')
    .set('Authorization', `Bearer ${token}`)
    .send({ symptoms: ['fever'], description: 'difficulty breathing', age: 30 });

  assert.equal(res.status, 200);
  assert.strictEqual(res.body.data.assessment.isEmergency, true);
  assert.strictEqual(res.body.data.assessment.severity, 'EMERGENCY');
  assert.strictEqual(res.body.data.assessment.priority, 0);
  ctx.cleanup();
});
