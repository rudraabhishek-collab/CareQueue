import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

/**
 * Opens (or creates) the SQLite database and applies recommended pragmas.
 *
 * The database layer is isolated from HTTP routes; callers pass a
 * database path and receive a better-sqlite3 connection.
 *
 * @param {object} options
 * @param {string} options.databasePath - Path to the SQLite file, or ':memory:'.
 * @returns {import('better-sqlite3').Database} The open connection.
 */
export function openDatabase({ databasePath }) {
  if (databasePath !== ':memory:') {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const db = new Database(databasePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

/**
 * Applies pending SQL migration files in filename order.
 *
 * Applied migrations are recorded in a `schema_migrations` table so each
 * migration runs exactly once. Each migration executes inside a transaction.
 *
 * @param {import('better-sqlite3').Database} db - Open SQLite connection.
 * @param {object} options
 * @param {string} options.migrationsDir - Directory containing `*.sql` migrations.
 */
export function runMigrations(db, { migrationsDir }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    db
      .prepare('SELECT name FROM schema_migrations')
      .all()
      .map((row) => row.name)
  );

  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const recordMigration = db.prepare('INSERT INTO schema_migrations (name) VALUES (?)');

  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    const apply = db.transaction(() => {
      db.exec(sql);
      recordMigration.run(file);
    });

    apply();
  }
}

/**
 * Closes the database connection if it is open.
 *
 * @param {import('better-sqlite3').Database | null | undefined} db - Open connection.
 */
export function closeDatabase(db) {
  if (db && db.open) db.close();
}
