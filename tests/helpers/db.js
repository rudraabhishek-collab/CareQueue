import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, runMigrations, closeDatabase } from '../../backend/db/database.js';
import { seedDatabase } from '../../backend/db/seed.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const migrationsDir = path.join(projectRoot, 'backend', 'db', 'migrations');

/**
 * Opens a throwaway in-memory SQLite database with migrations applied.
 * Tests NEVER touch the development database file.
 *
 * @returns {{ db: import('better-sqlite3').Database, migrationsDir: string, cleanup: () => void }}
 */
export function createTestDb() {
  const db = openDatabase({ databasePath: ':memory:' });
  runMigrations(db, { migrationsDir });

  return {
    db,
    migrationsDir,
    cleanup() {
      closeDatabase(db);
    },
  };
}

/**
 * Opens a throwaway in-memory database with migrations AND demo seeds applied.
 *
 * @returns {{ db: import('better-sqlite3').Database, cleanup: () => void }}
 */
export function createSeededTestDb() {
  const db = openDatabase({ databasePath: ':memory:' });
  seedDatabase(db, { migrationsDir });

  return {
    db,
    cleanup() {
      closeDatabase(db);
    },
  };
}
