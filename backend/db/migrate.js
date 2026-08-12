import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile, loadConfig } from '../config/env.js';
import { openDatabase, runMigrations, closeDatabase } from './database.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

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
  runMigrations(db, { migrationsDir: config.migrationsDir });
  const applied = db.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get().count;
  console.log(`[carequeue-db] migrations complete (${applied} migration(s) applied total)`);
} catch (err) {
  console.error(`[carequeue-db] migration failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  closeDatabase(db);
}
