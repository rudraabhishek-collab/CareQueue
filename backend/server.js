import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile, loadConfig } from './config/env.js';
import { createLogger } from './utils/logger.js';
import { openDatabase, runMigrations, closeDatabase } from './db/database.js';
import { createApp } from './app.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

loadEnvFile(path.join(projectRoot, '.env'));

let config;
try {
  config = loadConfig(process.env);
} catch (err) {
  console.error(`[carequeue-api] ${err.message}`);
  process.exit(1);
}

const logger = createLogger(config.logLevel);

let db;
try {
  db = openDatabase({ databasePath: config.databasePath });
  runMigrations(db, { migrationsDir: config.migrationsDir });
  logger.info({ databasePath: config.databasePath }, 'database ready');
} catch (err) {
  logger.error({ err }, 'failed to initialize database');
  process.exit(1);
}

const app = createApp({ config, db, logger });

const server = app.listen(config.port, () => {
  logger.info({ port: config.port, nodeEnv: config.nodeEnv }, 'carequeue-api listening');
});

function shutdown(signal) {
  logger.info({ signal }, 'shutting down');
  server.close(() => {
    closeDatabase(db);
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
