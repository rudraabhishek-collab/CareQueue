import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile, loadConfig } from '../config/env.js';
import { openDatabase, runMigrations, closeDatabase } from './database.js';
import { seedDatabase } from './seed.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

loadEnvFile(path.join(projectRoot, '.env'));

let config;
try {
  config = loadConfig(process.env);
} catch (err) {
  console.error(`[carequeue-db] ${err.message}`);
  process.exit(1);
}

if (config.nodeEnv === 'production') {
  console.error(
    '[carequeue-db] db:reset is a DEVELOPMENT-ONLY command. Refusing to run in production.'
  );
  process.exit(1);
}

const dbPath = config.databasePath;

try {
  for (const suffix of ['', '-wal', '-shm']) {
    const file = `${dbPath}${suffix}`;
    if (fs.existsSync(file)) fs.rmSync(file);
  }
  console.log(`[carequeue-db] removed local database: ${dbPath}`);

  const db = openDatabase({ databasePath: dbPath });
  try {
    runMigrations(db, { migrationsDir: config.migrationsDir });
    const counts = seedDatabase(db, { migrationsDir: config.migrationsDir });
    console.log(
      `[carequeue-db] recreated — migrations applied, seed complete (${counts.hospitals} hospital(s), ${counts.departments} department(s), ${counts.symptoms} symptom(s)).`
    );
  } finally {
    closeDatabase(db);
  }
} catch (err) {
  console.error(`[carequeue-db] reset failed: ${err.message}`);
  process.exitCode = 1;
}
