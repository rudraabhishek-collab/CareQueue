import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from '../helpers/db.js';
import { seedAuthUsers, readDemoCredentials } from '../../backend/db/auth-seed.js';
import { verifyPassword } from '../../backend/utils/password.js';

const CREDENTIALS = {
  patient: 'DemoPatient123!',
  doctor: 'DemoDoctor123!',
  staff: 'DemoStaff123!',
  admin: 'DemoAdmin123!',
};

test('auth seed creates the four demo users with correct roles', async () => {
  const { db, migrationsDir, cleanup } = createTestDb();

  const counts = await seedAuthUsers(db, { migrationsDir, credentials: CREDENTIALS });
  assert.deepEqual(counts, { users: 4, patients: 1, doctors: 1 });

  const users = db.prepare('SELECT phone, role, name FROM users ORDER BY id').all();
  assert.deepEqual(users, [
    { phone: '+919000000001', role: 'patient', name: 'Demo Patient' },
    { phone: '+919000000002', role: 'doctor', name: 'Demo Doctor' },
    { phone: '+919000000003', role: 'staff', name: 'Demo Staff' },
    { phone: '+919000000004', role: 'admin', name: 'Demo Admin' },
  ]);
  cleanup();
});

test('demo passwords are stored hashed and verify correctly', async () => {
  const { db, migrationsDir, cleanup } = createTestDb();
  await seedAuthUsers(db, { migrationsDir, credentials: CREDENTIALS });

  const user = db.prepare("SELECT * FROM users WHERE phone = '+919000000001'").get();
  assert.ok(user.password_hash, 'password hashed');
  assert.notEqual(user.password_hash, CREDENTIALS.patient);
  assert.equal(await verifyPassword(CREDENTIALS.patient, user.password_hash), true);
  cleanup();
});

test('demo patient is linked to a patients row', async () => {
  const { db, migrationsDir, cleanup } = createTestDb();
  await seedAuthUsers(db, { migrationsDir, credentials: CREDENTIALS });

  const patient = db
    .prepare(
      `SELECT p.id, p.phone FROM patients p
       JOIN users u ON u.id = p.user_id
       WHERE u.role = 'patient' AND u.phone = '+919000000001'`
    )
    .get();
  assert.ok(patient, 'patient profile linked to the demo patient user');
  assert.equal(patient.phone, '+919000000001');
  cleanup();
});

test('demo doctor is linked to a valid department with demo registration id', async () => {
  const { db, migrationsDir, cleanup } = createTestDb();
  await seedAuthUsers(db, { migrationsDir, credentials: CREDENTIALS });

  const doctor = db
    .prepare(
      `SELECT d.name, d.registration_id, d.available, dep.name AS department, h.name AS hospital
       FROM doctors d
       JOIN users u ON u.id = d.user_id
       JOIN departments dep ON dep.id = d.department_id
       JOIN hospitals h ON h.id = dep.hospital_id
       WHERE u.phone = '+919000000002'`
    )
    .get();
  assert.ok(doctor, 'doctor profile exists');
  assert.equal(doctor.registration_id, 'DEMO-DOC-001');
  assert.equal(doctor.available, 1);
  assert.equal(doctor.department, 'General Medicine');
  assert.equal(doctor.hospital, 'AIIMS New Delhi');
  cleanup();
});

test('auth seed is idempotent', async () => {
  const { db, migrationsDir, cleanup } = createTestDb();

  await seedAuthUsers(db, { migrationsDir, credentials: CREDENTIALS });
  await seedAuthUsers(db, { migrationsDir, credentials: CREDENTIALS });
  await seedAuthUsers(db, { migrationsDir, credentials: CREDENTIALS });

  assert.equal(db.prepare('SELECT COUNT(*) c FROM users').get().c, 4);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM patients').get().c, 1);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM doctors').get().c, 1);
  cleanup();
});

test('readDemoCredentials fails clearly when an env password is missing', () => {
  const env = {
    DEMO_PATIENT_PASSWORD: 'ValidPatient123',
    DEMO_DOCTOR_PASSWORD: 'ValidDoctor123',
    DEMO_STAFF_PASSWORD: 'ValidStaff123',
  };
  assert.throws(() => readDemoCredentials(env), /DEMO_ADMIN_PASSWORD/);
});

test('readDemoCredentials rejects too-short env passwords', () => {
  const env = { ...CREDENTIALS, DEMO_PATIENT_PASSWORD: 'short' };
  assert.throws(() => readDemoCredentials(env), /8\+ chars/);
});
