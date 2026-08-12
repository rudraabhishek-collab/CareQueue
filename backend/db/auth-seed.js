import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile, loadConfig } from '../config/env.js';
import { openDatabase, closeDatabase } from './database.js';
import { seedDatabase } from './seed.js';
import { hashPassword } from '../utils/password.js';

// ---------------------------------------------------------------------------
// DEVELOPMENT-ONLY demo accounts.
//
// Credentials are NOT hardcoded. They come from the environment
// (DEMO_PATIENT_PASSWORD / DEMO_DOCTOR_PASSWORD / DEMO_STAFF_PASSWORD /
// DEMO_ADMIN_PASSWORD). If any variable is missing this seed fails with a
// clear message instead of silently using a default password.
//
// The doctor is linked to the seeded General Medicine department of
// AIIMS New Delhi. Names/registration ids are clearly fictional.
// ---------------------------------------------------------------------------

const DEMO_USERS = [
  {
    role: 'patient',
    name: 'Demo Patient',
    phone: '+919000000001',
    envVar: 'DEMO_PATIENT_PASSWORD',
  },
  { role: 'doctor', name: 'Demo Doctor', phone: '+919000000002', envVar: 'DEMO_DOCTOR_PASSWORD' },
  { role: 'staff', name: 'Demo Staff', phone: '+919000000003', envVar: 'DEMO_STAFF_PASSWORD' },
  { role: 'admin', name: 'Demo Admin', phone: '+919000000004', envVar: 'DEMO_ADMIN_PASSWORD' },
];

const DOCTOR_REGISTRATION_ID = 'DEMO-DOC-001';
const DOCTOR_DEPARTMENT = { hospitalSlug: 'aiims-new-delhi', departmentName: 'General Medicine' };

/**
 * Reads demo credentials from the environment. Fails clearly if missing.
 *
 * @param {NodeJS.ProcessEnv} env
 * @returns {Record<string, string>} password per demo user id key.
 */
export function readDemoCredentials(env = process.env) {
  const credentials = {};
  for (const demo of DEMO_USERS) {
    const value = env[demo.envVar];
    if (!value || value.length < 8) {
      throw new Error(
        `Auth seed requires ${demo.envVar} (8+ chars) for the demo ${demo.role} account. ` +
          'Set it in .env. These credentials are DEVELOPMENT ONLY.'
      );
    }
    credentials[demo.role] = value;
  }
  return credentials;
}

/**
 * Seeds the four demo users (patient, doctor, staff, admin). Idempotent.
 *
 * - Ensures the base schema + demo hospital/department/symptom data exist.
 * - Creates users with INSERT OR IGNORE (phone is UNIQUE), then refreshes
 *   the password hash from the env-provided credential each run so changing
 *   the env password takes effect.
 * - Links the demo patient to a patients row and the demo doctor to a
 *   doctors row in the seeded General Medicine department.
 *
 * @param {import('better-sqlite3').Database} db - Open SQLite connection.
 * @param {object} options
 * @param {string} options.migrationsDir - Directory containing migrations.
 * @param {Record<string, string>} options.credentials - { patient, doctor, staff, admin } passwords.
 * @returns {{ users: number, patients: number, doctors: number }}
 */
export async function seedAuthUsers(db, { migrationsDir, credentials }) {
  seedDatabase(db, { migrationsDir });

  const insertUser = db.prepare(
    `INSERT OR IGNORE INTO users (phone, password_hash, role, name) VALUES (?, ?, ?, ?)`
  );
  const updateUserPassword = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
  const selectUserId = db.prepare('SELECT id FROM users WHERE phone = ?');
  const insertPatient = db.prepare(
    `INSERT OR IGNORE INTO patients (user_id, name, phone) VALUES (?, ?, ?)`
  );
  const insertDoctor = db.prepare(
    `INSERT OR IGNORE INTO doctors (department_id, user_id, name, registration_id, available)
     VALUES (?, ?, ?, ?, 1)`
  );

  const hashes = {};
  for (const demo of DEMO_USERS) {
    hashes[demo.role] = await hashPassword(credentials[demo.role]);
  }

  const seed = db.transaction(() => {
    const userIds = {};

    for (const demo of DEMO_USERS) {
      const result = insertUser.run(demo.phone, hashes[demo.role], demo.role, demo.name);
      // `changes` is 1 when the row was inserted and 0 when INSERT OR IGNORE
      // skipped it. lastInsertRowid is NOT reliable for ignored inserts, so
      // look up the existing row when nothing was inserted.
      const id = result.changes > 0 ? result.lastInsertRowid : selectUserId.get(demo.phone).id;
      userIds[demo.role] = id;
      updateUserPassword.run(hashes[demo.role], id);
    }

    // Demo patient gets a patients profile (users 1 -> 0..1 patients).
    insertPatient.run(userIds.patient, DEMO_USERS[0].name, DEMO_USERS[0].phone);

    // Demo doctor is linked to the seeded General Medicine department.
    const department = db
      .prepare(
        `SELECT d.id
         FROM departments d
         JOIN hospitals h ON h.id = d.hospital_id
         WHERE h.slug = ? AND d.name = ?`
      )
      .get(DOCTOR_DEPARTMENT.hospitalSlug, DOCTOR_DEPARTMENT.departmentName);
    if (!department) {
      throw new Error(`Auth seed: department "${DOCTOR_DEPARTMENT.departmentName}" not found.`);
    }
    insertDoctor.run(department.id, userIds.doctor, DEMO_USERS[1].name, DOCTOR_REGISTRATION_ID);

    return userIds;
  });

  seed();

  const count = (table) => db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
  return {
    users: count('users'),
    patients: count('patients'),
    doctors: count('doctors'),
  };
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  loadEnvFile(path.join(projectRoot, '.env'));

  let config;
  try {
    config = loadConfig(process.env);
  } catch (err) {
    console.error(`[carequeue-db] ${err.message}`);
    process.exit(1);
  }

  if (config.nodeEnv === 'production') {
    console.error('[carequeue-db] auth seed is DEVELOPMENT ONLY and refuses to run in production.');
    process.exit(1);
  }

  let credentials;
  try {
    credentials = readDemoCredentials(process.env);
  } catch (err) {
    console.error(`[carequeue-db] ${err.message}`);
    process.exit(1);
  }

  let db;
  try {
    db = openDatabase({ databasePath: config.databasePath });
    const counts = await seedAuthUsers(db, {
      migrationsDir: config.migrationsDir,
      credentials,
    });
    console.log(
      `[carequeue-db] auth seed complete — demo ${counts.users} user(s), ${counts.patients} patient profile(s), ${counts.doctors} doctor profile(s).`
    );
    console.log(
      '[carequeue-db] Demo accounts are DEVELOPMENT ONLY. Use the DEMO_*_PASSWORD env vars.'
    );
  } catch (err) {
    console.error(`[carequeue-db] auth seed failed: ${err.message}`);
    process.exitCode = 1;
  } finally {
    closeDatabase(db);
  }
}
