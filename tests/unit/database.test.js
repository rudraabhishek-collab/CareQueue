import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase, runMigrations } from '../../backend/db/database.js';
import { createTestContext } from '../helpers/context.js';
import { createTestDb } from '../helpers/db.js';

test('opens an in-memory database and runs migrations', () => {
  const ctx = createTestContext();

  const tables = ctx.db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => row.name);

  assert.ok(tables.includes('schema_migrations'), 'schema_migrations table must exist');
  assert.ok(tables.includes('app_meta'), 'baseline migration must have been applied');
  assert.ok(tables.includes('users'), 'core schema migration must have been applied');

  const applied = ctx.db
    .prepare('SELECT name FROM schema_migrations ORDER BY name')
    .all()
    .map((row) => row.name);
  assert.deepEqual(applied, [
    '001_create_app_meta.sql',
    '002_create_core_schema.sql',
    '003_add_doctors_user_unique.sql',
  ]);

  ctx.cleanup();
});

test('runMigrations is idempotent', () => {
  const ctx = createTestContext();

  runMigrations(ctx.db, { migrationsDir: ctx.config.migrationsDir });
  const applied = ctx.db.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get();
  assert.equal(applied.count, 3);

  ctx.cleanup();
});

test('schema_migrations table exists and records each migration', () => {
  const ctx = createTestContext();

  const columns = ctx.db.prepare('PRAGMA table_info(schema_migrations)').all();
  const names = columns.map((column) => column.name);
  assert.deepEqual(names, ['id', 'name', 'applied_at']);
  assert.equal(columns.find((column) => column.name === 'name').notnull, 1);

  ctx.cleanup();
});

test('a fresh database migrates successfully to the latest version', () => {
  const { db, cleanup } = createTestDb();

  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => row.name);

  for (const table of [
    'users',
    'patients',
    'hospitals',
    'departments',
    'doctors',
    'symptoms',
    'triage_assessments',
    'tokens',
    'queue_entries',
    'appointments',
    'notifications',
    'audit_logs',
  ]) {
    assert.ok(tables.includes(table), `${table} table must exist`);
  }

  cleanup();
});

test('openDatabase creates the data directory for file databases', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carequeue-'));
  const dbPath = path.join(dir, 'nested', 'test.db');
  const db = openDatabase({ databasePath: dbPath });

  assert.ok(fs.existsSync(dbPath), 'database file must be created');
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
