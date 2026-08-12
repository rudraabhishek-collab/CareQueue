import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext } from '../helpers/context.js';
import { hashPassword } from '../../backend/utils/password.js';
import { signToken } from '../../backend/services/auth.service.js';

function register(ctx, body = {}) {
  return ctx
    .request(ctx.app)
    .post('/api/v1/auth/register')
    .send({ name: 'Demo Patient', phone: '9999999999', password: 'StrongPassword123', ...body });
}

function login(ctx, body = {}) {
  return ctx.request(ctx.app).post('/api/v1/auth/login').send(body);
}

test('successful registration creates user + patient and returns a token', async () => {
  const ctx = createTestContext();

  const res = await register(ctx);
  assert.equal(res.status, 201);
  assert.equal(res.body.data.user.phone, '+919999999999');
  assert.equal(res.body.data.user.role, 'patient');
  assert.equal(res.body.data.user.name, 'Demo Patient');
  assert.ok(res.body.data.user.id, 'user id present');
  assert.ok(res.body.data.token, 'token present');
  assert.ok(!('password_hash' in res.body.data.user), 'password_hash never returned');

  const user = ctx.db.prepare("SELECT * FROM users WHERE phone = '+919999999999'").get();
  const patient = ctx.db.prepare('SELECT * FROM patients WHERE user_id = ?').get(user.id);
  assert.ok(user, 'user stored');
  assert.ok(user.password_hash, 'password hashed');
  assert.notEqual(user.password_hash, 'StrongPassword123', 'plaintext never stored');
  assert.match(user.password_hash, /^\$2[aby]\$/);
  assert.ok(patient, 'patient row created in same transaction');
  assert.equal(patient.phone, '+919999999999');

  const audit = ctx.db.prepare("SELECT * FROM audit_logs WHERE action = 'AUTH_REGISTER'").get();
  assert.ok(audit, 'AUTH_REGISTER recorded');
  assert.ok(!String(audit.meta).includes('StrongPassword123'), 'no password in audit meta');

  ctx.cleanup();
});

test('duplicate phone registration is rejected with 409 USER_EXISTS', async () => {
  const ctx = createTestContext();
  await register(ctx);
  const res = await register(ctx);
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'USER_EXISTS');
  const count = ctx.db
    .prepare("SELECT COUNT(*) c FROM users WHERE phone = '+919999999999'")
    .get().c;
  assert.equal(count, 1);
  ctx.cleanup();
});

test('registration normalizes equivalent phone representations to one user', async () => {
  const ctx = createTestContext();
  await register(ctx, { phone: '+919999999999' });
  const res = await register(ctx, { phone: '9999999999' });
  assert.equal(res.status, 409, 'same number in another format must collide');
  ctx.cleanup();
});

test('invalid phone is rejected with 400 VALIDATION_ERROR', async () => {
  const ctx = createTestContext();
  const res = await register(ctx, { phone: '1234567890' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  assert.ok(res.body.error.details.some((d) => d.path === 'phone'));
  ctx.cleanup();
});

test('short password is rejected with 400', async () => {
  const ctx = createTestContext();
  const res = await register(ctx, { password: 'short' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  ctx.cleanup();
});

test('missing fields are rejected with 400', async () => {
  const ctx = createTestContext();
  const bodies = [{}, { name: 'Only Name' }, { name: 'X', phone: '9999999999' }];
  for (const body of bodies) {
    const res = await ctx.request(ctx.app).post('/api/v1/auth/register').send(body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  }
  ctx.cleanup();
});

test('client cannot choose the admin role', async () => {
  const ctx = createTestContext();
  const res = await register(ctx, { role: 'admin' });
  assert.equal(res.status, 400, 'role field must be rejected by strict schema');
  const users = ctx.db.prepare('SELECT COUNT(*) c FROM users').get().c;
  assert.equal(users, 0, 'no user created');
  ctx.cleanup();
});

test('client cannot choose the doctor role either', async () => {
  const ctx = createTestContext();
  const res = await register(ctx, { role: 'doctor' });
  assert.equal(res.status, 400);
  ctx.cleanup();
});

test('login with valid credentials returns user + token', async () => {
  const ctx = createTestContext();
  await register(ctx);

  const res = await login(ctx, { phone: '9999999999', password: 'StrongPassword123' });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.user.phone, '+919999999999');
  assert.equal(res.body.data.user.role, 'patient');
  assert.ok(res.body.data.token);
  assert.ok(!('password_hash' in res.body.data.user));

  const audit = ctx.db
    .prepare("SELECT * FROM audit_logs WHERE action = 'AUTH_LOGIN_SUCCESS'")
    .get();
  assert.ok(audit, 'AUTH_LOGIN_SUCCESS recorded');
  ctx.cleanup();
});

test('login with wrong password returns generic 401', async () => {
  const ctx = createTestContext();
  await register(ctx);
  const res = await login(ctx, { phone: '9999999999', password: 'WrongPassword123' });
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
  ctx.cleanup();
});

test('login with unknown phone returns the same generic 401', async () => {
  const ctx = createTestContext();
  const res = await login(ctx, { phone: '9888888888', password: 'Whatever123' });
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
  const audit = ctx.db
    .prepare("SELECT * FROM audit_logs WHERE action = 'AUTH_LOGIN_FAILURE'")
    .get();
  assert.ok(audit, 'AUTH_LOGIN_FAILURE recorded');
  assert.equal(JSON.parse(audit.meta).reason, 'invalid_credentials');
  assert.ok(!String(audit.meta).includes('Whatever123'), 'no password in audit meta');
  ctx.cleanup();
});

test('login normalizes phone before lookup', async () => {
  const ctx = createTestContext();
  await register(ctx, { phone: '+919999999999' });
  const res = await login(ctx, { phone: ' 99999 99999 ', password: 'StrongPassword123' });
  assert.equal(res.status, 200, 'formatted variant of the same number must log in');
  ctx.cleanup();
});

test('login missing fields returns 400', async () => {
  const ctx = createTestContext();
  for (const body of [{}, { phone: '9999999999' }]) {
    const res = await login(ctx, body);
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  }
  ctx.cleanup();
});

test('login is throttled after repeated failures', async () => {
  const ctx = createTestContext();
  await register(ctx);

  for (let i = 0; i < 5; i += 1) {
    const res = await login(ctx, { phone: '9999999999', password: 'WrongPassword123' });
    assert.equal(res.status, 401, `attempt ${i + 1}`);
  }

  const blocked = await login(ctx, { phone: '9999999999', password: 'WrongPassword123' });
  assert.equal(blocked.status, 429, 'blocked after 5 failures');
  assert.equal(blocked.body.error.code, 'TOO_MANY_ATTEMPTS');

  ctx.cleanup();
});

test('existing demo-style users can log in with their hashed password', async () => {
  const ctx = createTestContext();
  const hash = await hashPassword('DemoPatient123!');
  ctx.db
    .prepare(
      "INSERT INTO users (phone, password_hash, role, name) VALUES ('+919000000001', ?, 'patient', 'Demo Patient')"
    )
    .run(hash);
  const res = await login(ctx, { phone: '+919000000001', password: 'DemoPatient123!' });
  assert.equal(res.status, 200);
  ctx.cleanup();
});

test('service signs minimal JWTs (sub + role only)', async () => {
  const ctx = createTestContext();
  const token = signToken({ id: 1, role: 'patient' }, { jwtSecret: 's', jwtExpiresIn: '1h' });
  const parts = token.split('.')[1];
  const claims = JSON.parse(Buffer.from(parts, 'base64url').toString('utf8'));
  assert.equal(claims.sub, '1');
  assert.equal(claims.role, 'patient');
  assert.ok(!('password' in claims));
  assert.ok(!('symptoms' in claims));
  ctx.cleanup();
});
