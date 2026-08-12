import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, createSeededTestDb } from '../helpers/db.js';
import { seedDatabase } from '../../backend/db/seed.js';

test('seed runs successfully and inserts expected demo data', () => {
  const { db, cleanup } = createSeededTestDb();

  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM hospitals').get().count, 5);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM departments').get().count, 15);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM symptoms').get().count, 16);

  cleanup();
});

test('running seed twice does not duplicate records', () => {
  const { db, migrationsDir, cleanup } = createTestDb();

  const first = seedDatabase(db, { migrationsDir });
  const second = seedDatabase(db, { migrationsDir });

  assert.deepEqual(first, { hospitals: 5, departments: 15, symptoms: 16 });
  assert.deepEqual(second, { hospitals: 5, departments: 15, symptoms: 16 });

  const count = (table) => db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
  assert.equal(count('hospitals'), 5, 'hospitals must not duplicate');
  assert.equal(count('departments'), 15, 'departments must not duplicate');
  assert.equal(count('symptoms'), 16, 'symptoms must not duplicate');

  cleanup();
});

test('expected demo hospitals exist', () => {
  const { db, cleanup } = createSeededTestDb();

  const hospitals = db.prepare('SELECT name, slug, type FROM hospitals ORDER BY id').all();
  assert.deepEqual(hospitals, [
    { name: 'AIIMS New Delhi', slug: 'aiims-new-delhi', type: 'tertiary' },
    { name: 'Safdarjung Hospital', slug: 'safdarjung-hospital', type: 'secondary' },
    { name: 'RML Hospital', slug: 'rml-hospital', type: 'secondary' },
    { name: 'Lok Nayak Hospital', slug: 'lok-nayak-hospital', type: 'secondary' },
    { name: 'Shastri Nagar PHC', slug: 'shastri-nagar-phc', type: 'phc' },
  ]);

  cleanup();
});

test('each hospital has General Medicine, Orthopedics and Pediatrics', () => {
  const { db, cleanup } = createSeededTestDb();

  const rows = db
    .prepare(
      `SELECT h.slug AS hospital, d.name AS department, d.code AS code
       FROM departments d
       JOIN hospitals h ON h.id = d.hospital_id
       ORDER BY h.id, d.name`
    )
    .all();

  const perHospital = new Map();
  for (const row of rows) {
    if (!perHospital.has(row.hospital)) perHospital.set(row.hospital, []);
    perHospital.get(row.hospital).push(`${row.code}:${row.department}`);
  }

  assert.equal(perHospital.size, 5, 'all five hospitals must have departments');
  for (const [hospital, departments] of perHospital) {
    assert.deepEqual(
      departments,
      ['GM:General Medicine', 'ORTHO:Orthopedics', 'PED:Pediatrics'],
      `${hospital} must have the three demo departments`
    );
  }

  cleanup();
});

test('all 16 expected demo symptoms exist', () => {
  const { db, cleanup } = createSeededTestDb();

  const symptoms = db
    .prepare('SELECT code, name_en, base_score, red_flag FROM symptoms ORDER BY id')
    .all();
  assert.deepEqual(symptoms, [
    { code: 'fever', name_en: 'High Fever', base_score: 20, red_flag: 0 },
    { code: 'cough', name_en: 'Cough/Cold', base_score: 10, red_flag: 0 },
    { code: 'chest', name_en: 'Chest Pain', base_score: 70, red_flag: 1 },
    { code: 'injury', name_en: 'Injury', base_score: 45, red_flag: 0 },
    { code: 'back', name_en: 'Back Pain', base_score: 25, red_flag: 0 },
    { code: 'dental', name_en: 'Toothache', base_score: 20, red_flag: 0 },
    { code: 'throat', name_en: 'Sore Throat', base_score: 10, red_flag: 0 },
    { code: 'ear', name_en: 'Ear Pain', base_score: 20, red_flag: 0 },
    { code: 'diarrhea', name_en: 'Loose Motion', base_score: 30, red_flag: 0 },
    { code: 'fatigue', name_en: 'Weakness', base_score: 25, red_flag: 0 },
    { code: 'vomit', name_en: 'Vomiting', base_score: 35, red_flag: 0 },
    { code: 'burn', name_en: 'Burn', base_score: 60, red_flag: 1 },
    { code: 'bite', name_en: 'Animal Bite', base_score: 55, red_flag: 1 },
    { code: 'acidity', name_en: 'Acidity/Gas', base_score: 15, red_flag: 0 },
    { code: 'urine', name_en: 'Urinary Issue', base_score: 35, red_flag: 0 },
    { code: 'stress', name_en: 'Anxiety/Stress', base_score: 20, red_flag: 0 },
  ]);

  cleanup();
});

test('seeding preserves manually added data (does not wipe the database)', () => {
  const { db, migrationsDir, cleanup } = createTestDb();

  db.prepare(
    "INSERT INTO hospitals (name, slug, city, type) VALUES ('Extra Hospital', 'extra-hospital', 'New Delhi', 'trauma')"
  ).run();

  seedDatabase(db, { migrationsDir });
  seedDatabase(db, { migrationsDir });

  const hospital = db.prepare("SELECT id FROM hospitals WHERE slug = 'extra-hospital'").get();
  assert.ok(hospital, 'manual rows must survive seeding');

  const total = db.prepare('SELECT COUNT(*) AS count FROM hospitals').get().count;
  assert.equal(total, 6, 'seed plus manual row without duplication');

  cleanup();
});
