import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from '../helpers/db.js';

function throwsSqliteError(fn) {
  try {
    fn();
  } catch (err) {
    assert.ok(err.code, 'better-sqlite3 error should carry a code');
    return err.code;
  }
  assert.fail('expected statement to throw');
}

function insertUser(db, overrides = {}) {
  db.prepare(
    'INSERT INTO users (phone, password_hash, role, name) VALUES (@phone, @password_hash, @role, @name)'
  ).run({
    phone: '9999000001',
    password_hash: null,
    role: 'patient',
    name: 'Test User',
    ...overrides,
  });
}

function insertHospital(db, overrides = {}) {
  db.prepare(
    'INSERT INTO hospitals (name, slug, city, type) VALUES (@name, @slug, @city, @type)'
  ).run({
    name: 'Demo Hospital',
    slug: 'demo-hospital',
    city: 'New Delhi',
    type: 'secondary',
    ...overrides,
  });
}

function insertPatient(db, overrides = {}) {
  db.prepare(
    'INSERT INTO patients (user_id, name, age, gender, phone) VALUES (@user_id, @name, @age, @gender, @phone)'
  ).run({
    user_id: null,
    name: 'Demo Patient',
    age: 30,
    gender: 'male',
    phone: '9999000002',
    ...overrides,
  });
}

function insertQueueFixture(db) {
  insertHospital(db, { name: 'Queue Hospital', slug: 'queue-hospital' });
  const { id: hospitalId } = db
    .prepare("SELECT id FROM hospitals WHERE slug = 'queue-hospital'")
    .get();
  db.prepare('INSERT INTO departments (hospital_id, name, code) VALUES (?, ?, ?)').run(
    hospitalId,
    'General Medicine',
    'GM'
  );
  const { id: departmentId } = db
    .prepare("SELECT id FROM departments WHERE hospital_id = ? AND name = 'General Medicine'")
    .get(hospitalId);
  insertPatient(db);
  const { id: patientId } = db.prepare("SELECT id FROM patients WHERE phone = '9999000002'").get();
  db.prepare('INSERT INTO tokens (token_no, hospital_id, department_id) VALUES (?, ?, ?)').run(
    'T-1001',
    hospitalId,
    departmentId
  );
  const { id: tokenId } = db.prepare("SELECT id FROM tokens WHERE token_no = 'T-1001'").get();
  return { hospitalId, departmentId, patientId, tokenId };
}

test('duplicate user phone is rejected', () => {
  const { db, cleanup } = createTestDb();
  insertUser(db);
  const code = throwsSqliteError(() => insertUser(db));
  assert.equal(code, 'SQLITE_CONSTRAINT_UNIQUE');
  cleanup();
});

test('duplicate hospital slug is rejected', () => {
  const { db, cleanup } = createTestDb();
  insertHospital(db);
  const code = throwsSqliteError(() => insertHospital(db));
  assert.equal(code, 'SQLITE_CONSTRAINT_UNIQUE');
  cleanup();
});

test('duplicate department name within the same hospital is rejected', () => {
  const { db, cleanup } = createTestDb();
  insertHospital(db);
  const { id: hospitalId } = db
    .prepare("SELECT id FROM hospitals WHERE slug = 'demo-hospital'")
    .get();
  db.prepare('INSERT INTO departments (hospital_id, name, code) VALUES (?, ?, ?)').run(
    hospitalId,
    'General Medicine',
    'GM'
  );

  const code = throwsSqliteError(() =>
    db
      .prepare('INSERT INTO departments (hospital_id, name, code) VALUES (?, ?, ?)')
      .run(hospitalId, 'General Medicine', 'GM2')
  );
  assert.equal(code, 'SQLITE_CONSTRAINT_UNIQUE');
  cleanup();
});

test('same department name is allowed in a different hospital', () => {
  const { db, cleanup } = createTestDb();
  insertHospital(db);
  insertHospital(db, { name: 'Other Hospital', slug: 'other-hospital' });
  const [first, second] = db
    .prepare('SELECT id FROM hospitals ORDER BY id')
    .all()
    .map((row) => row.id);

  db.prepare('INSERT INTO departments (hospital_id, name, code) VALUES (?, ?, ?)').run(
    first,
    'General Medicine',
    'GM'
  );
  db.prepare('INSERT INTO departments (hospital_id, name, code) VALUES (?, ?, ?)').run(
    second,
    'General Medicine',
    'GM'
  );

  const count = db.prepare('SELECT COUNT(*) AS count FROM departments').get().count;
  assert.equal(count, 2);
  cleanup();
});

test('invalid user role is rejected', () => {
  const { db, cleanup } = createTestDb();
  const code = throwsSqliteError(() => insertUser(db, { role: 'superuser' }));
  assert.equal(code, 'SQLITE_CONSTRAINT_CHECK');
  cleanup();
});

test('each allowed user role is accepted', () => {
  const { db, cleanup } = createTestDb();
  for (const role of ['patient', 'doctor', 'staff', 'admin']) {
    insertUser(db, { phone: `9999${role}000001`, role });
  }
  const roles = db
    .prepare('SELECT role FROM users ORDER BY id')
    .all()
    .map((row) => row.role);
  assert.deepEqual(roles, ['patient', 'doctor', 'staff', 'admin']);
  cleanup();
});

test('invalid hospital type is rejected', () => {
  const { db, cleanup } = createTestDb();
  const code = throwsSqliteError(() => insertHospital(db, { type: 'super-specialty' }));
  assert.equal(code, 'SQLITE_CONSTRAINT_CHECK');
  cleanup();
});

test('each allowed hospital type is accepted', () => {
  const { db, cleanup } = createTestDb();
  for (const type of ['tertiary', 'secondary', 'phc', 'trauma']) {
    insertHospital(db, { slug: `demo-${type}`, type });
  }
  const types = db
    .prepare('SELECT type FROM hospitals ORDER BY id')
    .all()
    .map((row) => row.type);
  assert.deepEqual(types, ['tertiary', 'secondary', 'phc', 'trauma']);
  cleanup();
});

test('invalid queue status is rejected', () => {
  const { db, cleanup } = createTestDb();
  const { hospitalId, departmentId, patientId, tokenId } = insertQueueFixture(db);

  const code = throwsSqliteError(() =>
    db
      .prepare(
        `INSERT INTO queue_entries
           (token_id, hospital_id, department_id, patient_id, priority, status)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(tokenId, hospitalId, departmentId, patientId, 0, 'ON_HOLD')
  );
  assert.equal(code, 'SQLITE_CONSTRAINT_CHECK');
  cleanup();
});

test('each allowed queue status is accepted', () => {
  const { db, cleanup } = createTestDb();
  const { hospitalId, departmentId, patientId } = insertQueueFixture(db);

  const statuses = ['WAITING', 'CALLED', 'IN_CONSULTATION', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];
  for (const status of statuses) {
    const { lastInsertRowid: tokenId } = db
      .prepare('INSERT INTO tokens (token_no, hospital_id, department_id) VALUES (?, ?, ?)')
      .run(`T-${status}`, hospitalId, departmentId);
    db.prepare(
      `INSERT INTO queue_entries
         (token_id, hospital_id, department_id, patient_id, status)
       VALUES (?, ?, ?, ?, ?)`
    ).run(tokenId, hospitalId, departmentId, patientId, status);
  }

  const stored = db
    .prepare('SELECT status FROM queue_entries ORDER BY id')
    .all()
    .map((row) => row.status);
  assert.deepEqual(stored, statuses);
  cleanup();
});

test('invalid age is rejected', () => {
  const { db, cleanup } = createTestDb();

  for (const age of [-1, 121]) {
    const code = throwsSqliteError(() => insertPatient(db, { age }));
    assert.equal(code, 'SQLITE_CONSTRAINT_CHECK', `age ${age} must be rejected`);
  }
  cleanup();
});

test('boundary ages are accepted', () => {
  const { db, cleanup } = createTestDb();
  insertPatient(db, { age: 0 });
  insertPatient(db, { age: 120, phone: '9999000003' });
  const count = db.prepare('SELECT COUNT(*) AS count FROM patients').get().count;
  assert.equal(count, 2);
  cleanup();
});

test('foreign key violation is rejected', () => {
  const { db, cleanup } = createTestDb();
  const code = throwsSqliteError(() =>
    db
      .prepare('INSERT INTO departments (hospital_id, name, code) VALUES (?, ?, ?)')
      .run(99999, 'General Medicine', 'GM')
  );
  assert.equal(code, 'SQLITE_CONSTRAINT_FOREIGNKEY');
  cleanup();
});

test('a queue entry must reference an existing hospital, department, patient and token', () => {
  const { db, cleanup } = createTestDb();

  for (const column of ['hospital_id', 'department_id', 'patient_id', 'token_id']) {
    const code = throwsSqliteError(() =>
      db
        .prepare(
          `INSERT INTO queue_entries
             (token_id, hospital_id, department_id, patient_id)
           VALUES (?, ?, ?, ?)`
        )
        .run(
          column === 'token_id' ? 99999 : 'T-9999',
          column === 'hospital_id' ? 99999 : 1,
          column === 'department_id' ? 99999 : 1,
          column === 'patient_id' ? 99999 : 1
        )
    );
    assert.equal(code, 'SQLITE_CONSTRAINT_FOREIGNKEY', `${column} FK must be enforced`);
  }
  cleanup();
});
