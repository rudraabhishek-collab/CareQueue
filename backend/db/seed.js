import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile, loadConfig } from '../config/env.js';
import { openDatabase, runMigrations, closeDatabase } from './database.js';

/**
 * Demo hospitals. These correspond to the facilities shown in the CareQueue
 * UI and are seeded as DEMO data only — they are NOT a live integration.
 * Addresses are intentionally generic area references.
 */
const HOSPITALS = [
  {
    name: 'AIIMS New Delhi',
    slug: 'aiims-new-delhi',
    city: 'New Delhi',
    type: 'tertiary',
    address: 'Ansari Nagar, New Delhi',
    lat: 28.5672,
    lng: 77.21,
  },
  {
    name: 'Safdarjung Hospital',
    slug: 'safdarjung-hospital',
    city: 'New Delhi',
    type: 'secondary',
    address: 'Ring Road, New Delhi',
    lat: 28.5679,
    lng: 77.2056,
  },
  {
    name: 'RML Hospital',
    slug: 'rml-hospital',
    city: 'New Delhi',
    type: 'secondary',
    address: 'Baba Kharak Singh Marg, New Delhi',
    lat: 28.6271,
    lng: 77.2123,
  },
  {
    name: 'Lok Nayak Hospital',
    slug: 'lok-nayak-hospital',
    city: 'New Delhi',
    type: 'secondary',
    address: 'Jawahar Lal Nehru Marg, New Delhi',
    lat: 28.6328,
    lng: 77.2301,
  },
  {
    name: 'Shastri Nagar PHC',
    slug: 'shastri-nagar-phc',
    city: 'New Delhi',
    type: 'phc',
    address: 'Shastri Nagar, New Delhi',
    lat: 28.6661,
    lng: 77.2234,
  },
];

const DEPARTMENTS = [
  { code: 'GM', name: 'General Medicine', avg_consult_minutes: 10 },
  { code: 'ORTHO', name: 'Orthopedics', avg_consult_minutes: 15 },
  { code: 'PED', name: 'Pediatrics', avg_consult_minutes: 12 },
];

/**
 * Symptom reference data. Codes match the UI i18n keys (sym_*) so a later
 * phase can map UI selections to codes directly.
 *
 * !!! DEMONSTRATION RULES ONLY — NOT CLINICALLY VALIDATED. !!!
 * base_score, red_flag and care_level_hint are plausible demo values for a
 * decision-support prototype. They must not be treated as medical guidance.
 */
const SYMPTOMS = [
  {
    code: 'fever',
    name_en: 'High Fever',
    name_hi: 'तेज़ बुखार',
    base_score: 20,
    red_flag: 0,
    care_level_hint: 'primary',
  },
  {
    code: 'cough',
    name_en: 'Cough/Cold',
    name_hi: 'खांसी/जुकाम',
    base_score: 10,
    red_flag: 0,
    care_level_hint: 'primary',
  },
  {
    code: 'chest',
    name_en: 'Chest Pain',
    name_hi: 'छाती में दर्द',
    base_score: 70,
    red_flag: 1,
    care_level_hint: 'emergency',
  },
  {
    code: 'injury',
    name_en: 'Injury',
    name_hi: 'चोट',
    base_score: 45,
    red_flag: 0,
    care_level_hint: 'secondary',
  },
  {
    code: 'back',
    name_en: 'Back Pain',
    name_hi: 'पीठ दर्द',
    base_score: 25,
    red_flag: 0,
    care_level_hint: 'secondary',
  },
  {
    code: 'dental',
    name_en: 'Toothache',
    name_hi: 'दांत दर्द',
    base_score: 20,
    red_flag: 0,
    care_level_hint: 'secondary',
  },
  {
    code: 'throat',
    name_en: 'Sore Throat',
    name_hi: 'गले में खराश',
    base_score: 10,
    red_flag: 0,
    care_level_hint: 'primary',
  },
  {
    code: 'ear',
    name_en: 'Ear Pain',
    name_hi: 'कान दर्द',
    base_score: 20,
    red_flag: 0,
    care_level_hint: 'secondary',
  },
  {
    code: 'diarrhea',
    name_en: 'Loose Motion',
    name_hi: 'दस्त',
    base_score: 30,
    red_flag: 0,
    care_level_hint: 'primary',
  },
  {
    code: 'fatigue',
    name_en: 'Weakness',
    name_hi: 'कमजोरी',
    base_score: 25,
    red_flag: 0,
    care_level_hint: 'primary',
  },
  {
    code: 'vomit',
    name_en: 'Vomiting',
    name_hi: 'उल्टी',
    base_score: 35,
    red_flag: 0,
    care_level_hint: 'secondary',
  },
  {
    code: 'burn',
    name_en: 'Burn',
    name_hi: 'जलना',
    base_score: 60,
    red_flag: 1,
    care_level_hint: 'emergency',
  },
  {
    code: 'bite',
    name_en: 'Animal Bite',
    name_hi: 'जानवर का काटना',
    base_score: 55,
    red_flag: 1,
    care_level_hint: 'emergency',
  },
  {
    code: 'acidity',
    name_en: 'Acidity/Gas',
    name_hi: 'एसिडिटी/गैस',
    base_score: 15,
    red_flag: 0,
    care_level_hint: 'primary',
  },
  {
    code: 'urine',
    name_en: 'Urinary Issue',
    name_hi: 'पेशाब की समस्या',
    base_score: 35,
    red_flag: 0,
    care_level_hint: 'secondary',
  },
  {
    code: 'stress',
    name_en: 'Anxiety/Stress',
    name_hi: 'तनाव/घबराहट',
    base_score: 20,
    red_flag: 0,
    care_level_hint: 'secondary',
  },
];

/**
 * Seeds demo/reference data. Idempotent: relies on unique constraints with
 * INSERT OR IGNORE so running multiple times never creates duplicates and
 * never wipes existing rows.
 *
 * @param {import('better-sqlite3').Database} db - Open SQLite connection.
 * @param {object} options
 * @param {string} options.migrationsDir - Directory containing `*.sql` migrations.
 * @returns {{ hospitals: number, departments: number, symptoms: number }}
 */
export function seedDatabase(db, { migrationsDir }) {
  runMigrations(db, { migrationsDir });

  const insertHospital = db.prepare(`
    INSERT OR IGNORE INTO hospitals (name, slug, city, type, address, lat, lng, active)
    VALUES (@name, @slug, @city, @type, @address, @lat, @lng, 1)
  `);
  const selectHospitalId = db.prepare('SELECT id FROM hospitals WHERE slug = ?');
  const insertDepartment = db.prepare(`
    INSERT OR IGNORE INTO departments (hospital_id, name, code, avg_consult_minutes, active)
    VALUES (@hospital_id, @name, @code, @avg_consult_minutes, 1)
  `);
  const insertSymptom = db.prepare(`
    INSERT OR IGNORE INTO symptoms (code, name_en, name_hi, base_score, red_flag, care_level_hint)
    VALUES (@code, @name_en, @name_hi, @base_score, @red_flag, @care_level_hint)
  `);

  const seed = db.transaction(() => {
    for (const hospital of HOSPITALS) {
      insertHospital.run(hospital);
      const { id: hospitalId } = selectHospitalId.get(hospital.slug);
      for (const department of DEPARTMENTS) {
        insertDepartment.run({
          hospital_id: hospitalId,
          name: department.name,
          code: department.code,
          avg_consult_minutes: department.avg_consult_minutes,
        });
      }
    }
    for (const symptom of SYMPTOMS) {
      insertSymptom.run(symptom);
    }
  });

  seed();

  const count = (table) => db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
  return {
    hospitals: count('hospitals'),
    departments: count('departments'),
    symptoms: count('symptoms'),
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

  let db;
  try {
    db = openDatabase({ databasePath: config.databasePath });
    const counts = seedDatabase(db, { migrationsDir: config.migrationsDir });
    console.log(
      `[carequeue-db] seed complete — ${counts.hospitals} hospital(s), ${counts.departments} department(s), ${counts.symptoms} symptom(s)`
    );
    console.log(
      '[carequeue-db] NOTE: seeded symptom scores are DEMO rules only and are not clinically validated.'
    );
  } catch (err) {
    console.error(`[carequeue-db] seed failed: ${err.message}`);
    process.exitCode = 1;
  } finally {
    closeDatabase(db);
  }
}
