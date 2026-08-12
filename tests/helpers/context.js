import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { createApp } from '../../backend/app.js';
import { openDatabase, runMigrations } from '../../backend/db/database.js';
import { createLogger } from '../../backend/utils/logger.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Builds a fully configured app backed by an in-memory SQLite database.
 *
 * @param {object} [overrides] - Optional config overrides.
 * @returns {{ app: import('express').Express, db: import('better-sqlite3').Database, config: object, cleanup: () => void }}
 */
export function createTestContext(overrides = {}) {
  const config = {
    nodeEnv: 'test',
    port: 0,
    jwtSecret: 'test-secret-not-for-production',
    jwtExpiresIn: '1h',
    databasePath: ':memory:',
    migrationsDir: path.join(projectRoot, 'backend', 'db', 'migrations'),
    frontendDir: path.join(projectRoot, 'frontend'),
    logLevel: 'silent',
    ...overrides,
  };

  const logger = createLogger(config.logLevel);
  const db = openDatabase({ databasePath: config.databasePath });
  runMigrations(db, { migrationsDir: config.migrationsDir });

  const app = createApp({ config, db, logger });

  return {
    app,
    db,
    config,
    request,
    cleanup() {
      db.close();
    },
  };
}
