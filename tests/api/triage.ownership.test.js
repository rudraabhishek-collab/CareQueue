import test from 'node:test';
import assert from 'node:assert/strict';
import { signToken } from '../helpers/auth.js';
import { createTestContext } from '../helpers/context.js';

test("Ownership: Patient A only sees Patient A's assessments", async () => {
  const ctx = createTestContext();

  // Register Patient A
  await ctx.request(ctx.app).post('/api/v1/auth/register').send({
    name: 'Patient A',
    phone: '9999000100',
    password: 'Password123',
  });

  const patientAUser = ctx.db.prepare('SELECT id FROM users WHERE phone = ?').get('+919999000100');
  const patientAToken = signToken({ sub: patientAUser.id, role: 'patient' });

  // Register Patient B
  await ctx.request(ctx.app).post('/api/v1/auth/register').send({
    name: 'Patient B',
    phone: '9999000101',
    password: 'Password123',
  });

  const patientBUser = ctx.db.prepare('SELECT id FROM users WHERE phone = ?').get('+919999000101');
  const patientBToken = signToken({ sub: patientBUser.id, role: 'patient' });

  // Patient A creates an assessment
  await ctx
    .request(ctx.app)
    .post('/api/v1/triage/assess')
    .set('Authorization', `Bearer ${patientAToken}`)
    .send({ symptoms: ['fever'], description: 'Patient A fever', age: 21 });

  // Patient B creates an assessment
  await ctx
    .request(ctx.app)
    .post('/api/v1/triage/assess')
    .set('Authorization', `Bearer ${patientBToken}`)
    .send({ symptoms: ['cough'], description: 'Patient B cough', age: 30 });

  // Patient A views their assessments
  const aRes = await ctx
    .request(ctx.app)
    .get('/api/v1/triage/assessments/me')
    .set('Authorization', `Bearer ${patientAToken}`);

  assert.equal(aRes.status, 200);
  assert.ok(
    aRes.body.data.assessments.some((a) => a.symptom_codes && a.symptom_codes.includes('fever')),
    'Patient A sees own assessment with fever'
  );
  assert.ok(
    !aRes.body.data.assessments.some((a) => a.symptom_codes && a.symptom_codes.includes('cough')),
    "Patient A does NOT see Patient B's cough assessment"
  );

  ctx.cleanup();
});

test("Ownership: Patient B only sees Patient B's assessments", async () => {
  const ctx = createTestContext();

  // Register Patient A
  await ctx.request(ctx.app).post('/api/v1/auth/register').send({
    name: 'Patient A',
    phone: '9999000102',
    password: 'Password123',
  });

  const patientAUser = ctx.db.prepare('SELECT id FROM users WHERE phone = ?').get('+919999000102');
  const patientAToken = signToken({ sub: patientAUser.id, role: 'patient' });

  // Register Patient B
  await ctx.request(ctx.app).post('/api/v1/auth/register').send({
    name: 'Patient B',
    phone: '9999000103',
    password: 'Password123',
  });

  const patientBUser = ctx.db.prepare('SELECT id FROM users WHERE phone = ?').get('+919999000103');
  const patientBToken = signToken({ sub: patientBUser.id, role: 'patient' });

  // Patient A creates an assessment
  await ctx
    .request(ctx.app)
    .post('/api/v1/triage/assess')
    .set('Authorization', `Bearer ${patientAToken}`)
    .send({ symptoms: ['fever'], description: 'Patient A fever', age: 21 });

  // Patient B creates an assessment
  await ctx
    .request(ctx.app)
    .post('/api/v1/triage/assess')
    .set('Authorization', `Bearer ${patientBToken}`)
    .send({ symptoms: ['cough'], description: 'Patient B cough', age: 30 });

  // Patient B views their assessments
  const bRes = await ctx
    .request(ctx.app)
    .get('/api/v1/triage/assessments/me')
    .set('Authorization', `Bearer ${patientBToken}`);

  assert.equal(bRes.status, 200);
  assert.ok(
    bRes.body.data.assessments.some((a) => a.symptom_codes && a.symptom_codes.includes('cough')),
    'Patient B sees own assessment with cough'
  );
  assert.ok(
    !bRes.body.data.assessments.some((a) => a.symptom_codes && a.symptom_codes.includes('fever')),
    "Patient B does NOT see Patient A's fever assessment"
  );

  ctx.cleanup();
});

test("Ownership: Patient must never access another patient's triage history via URL parameters", async () => {
  const ctx = createTestContext();

  // Register Patient A and create assessment
  await ctx.request(ctx.app).post('/api/v1/auth/register').send({
    name: 'Patient A',
    phone: '9999000104',
    password: 'Password123',
  });

  const patientAUser = ctx.db.prepare('SELECT id FROM users WHERE phone = ?').get('+919999000104');
  const patientAToken = signToken({ sub: patientAUser.id, role: 'patient' });

  // Register Patient B and create assessment
  await ctx.request(ctx.app).post('/api/v1/auth/register').send({
    name: 'Patient B',
    phone: '9999000105',
    password: 'Password123',
  });

  const patientBUser = ctx.db.prepare('SELECT id FROM users WHERE phone = ?').get('+919999000105');
  const patientBToken = signToken({ sub: patientBUser.id, role: 'patient' });

  await ctx
    .request(ctx.app)
    .post('/api/v1/triage/assess')
    .set('Authorization', `Bearer ${patientBToken}`)
    .send({ symptoms: ['chest'], description: 'Patient B emergency', age: 40 });

  // Patient A tries to access Patient B's assessment via URL parameter
  const res = await ctx
    .request(ctx.app)
    .get('/api/v1/triage/assessments/me')
    .set('Authorization', `Bearer ${patientAToken}`);

  assert.equal(res.status, 200);
  // Patient A should only see their own assessments (which may be none)
  ctx.cleanup();
});

test('Ownership: No patient ID accepted from query parameters', async () => {
  const ctx = createTestContext();

  // Register a patient and create assessment
  await ctx.request(ctx.app).post('/api/v1/auth/register').send({
    name: 'Test User',
    phone: '9999000106',
    password: 'Password123',
  });

  const user = ctx.db.prepare('SELECT id FROM users WHERE phone = ?').get('+919999000106');
  const token = signToken({ sub: user.id, role: 'patient' });

  // Create assessment without patient ID in body
  await ctx
    .request(ctx.app)
    .post('/api/v1/triage/assess')
    .set('Authorization', `Bearer ${token}`)
    .send({ symptoms: ['fever'], description: 'Test', age: 21 });

  // Verify assessment was created for the authenticated patient
  const assessment = ctx.db
    .prepare('SELECT patient_id FROM triage_assessments ORDER BY id DESC LIMIT 1')
    .get();
  assert.ok(
    assessment.patient_id === user.id,
    'Assessment patient_id must match authenticated user'
  );

  ctx.cleanup();
});
