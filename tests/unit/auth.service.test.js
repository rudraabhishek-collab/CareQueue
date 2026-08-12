import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from '../helpers/db.js';
import { createAuthService } from '../../backend/services/auth.service.js';
import { HttpError } from '../../backend/utils/http-error.js';

const config = { jwtSecret: 'test-secret-not-for-production', jwtExpiresIn: '1h' };

test('register creates user and patient in one transaction', async () => {
  const { db, cleanup } = createTestDb();
  const auth = createAuthService({ db, config });

  const result = await auth.register({
    name: 'Demo Patient',
    phone: '9999999999',
    password: 'StrongPassword123',
  });

  assert.equal(result.user.role, 'patient');
  assert.equal(result.user.phone, '+919999999999');
  assert.ok(result.token);

  const patient = db.prepare('SELECT * FROM patients WHERE user_id = ?').get(result.user.id);
  assert.ok(patient, 'patient created');
  cleanup();
});

test('register rolls back completely when patient creation fails', async () => {
  const { db, cleanup } = createTestDb();

  // Proxy that makes the patients insert fail, leaving everything else intact.
  const failingDb = new Proxy(db, {
    get(target, prop) {
      if (prop === 'prepare') {
        return (sql) => {
          const stmt = target.prepare(sql);
          if (sql.includes('INSERT INTO patients')) {
            return {
              run: () => {
                throw new Error('simulated patient insert failure');
              },
            };
          }
          return stmt;
        };
      }
      const value = target[prop];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });

  const auth = createAuthService({ db: failingDb, config });

  await assert.rejects(
    () =>
      auth.register({ name: 'Demo Patient', phone: '9999999999', password: 'StrongPassword123' }),
    /simulated patient insert failure/
  );

  assert.equal(db.prepare('SELECT COUNT(*) c FROM users').get().c, 0, 'user insert rolled back');
  assert.equal(
    db.prepare('SELECT COUNT(*) c FROM patients').get().c,
    0,
    'patient insert rolled back'
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) c FROM audit_logs WHERE action = 'AUTH_REGISTER'").get().c,
    0,
    'audit row rolled back'
  );

  cleanup();
});

test('register rejects duplicate phone with USER_EXISTS', async () => {
  const { db, cleanup } = createTestDb();
  const auth = createAuthService({ db, config });

  await auth.register({ name: 'A', phone: '9999999999', password: 'StrongPassword123' });

  await assert.rejects(
    () => auth.register({ name: 'B', phone: '+919999999999', password: 'OtherPass123' }),
    (err) => err instanceof HttpError && err.status === 409 && err.code === 'USER_EXISTS'
  );
  cleanup();
});

test('register rejects invalid phone even before hitting the database', async () => {
  const { db, cleanup } = createTestDb();
  const auth = createAuthService({ db, config });

  await assert.rejects(
    () => auth.register({ name: 'A', phone: '12345', password: 'StrongPassword123' }),
    (err) => err instanceof HttpError && err.status === 400
  );
  cleanup();
});
