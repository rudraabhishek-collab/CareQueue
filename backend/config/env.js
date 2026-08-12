import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Loads KEY=VALUE pairs from a .env file into process.env.
 * Does NOT override variables that are already set in the environment.
 *
 * @param {string} filePath - Path to the .env file (missing file is ignored).
 */
export function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf8');

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/**
 * Validates the environment and returns a frozen application config.
 * Throws a clear error when required configuration is missing.
 *
 * @param {NodeJS.ProcessEnv} [env] - Environment variables to read.
 * @returns {Readonly<object>} Normalized configuration.
 */
export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const port = Number.parseInt(env.PORT || '3000', 10);

  const jwtSecret = env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error(
      'Missing required environment variable JWT_SECRET. ' +
        'Copy .env.example to .env and set a value before starting the server.'
    );
  }

  return Object.freeze({
    nodeEnv,
    port: Number.isNaN(port) ? 3000 : port,
    jwtSecret,
    jwtExpiresIn: env.JWT_EXPIRES_IN || '2h',
    databasePath: path.resolve(projectRoot, env.DATABASE_PATH || './data/carequeue.db'),
    migrationsDir: path.join(projectRoot, 'backend', 'db', 'migrations'),
    frontendDir: path.join(projectRoot, 'frontend'),
    logLevel: env.LOG_LEVEL || 'info',
  });
}
