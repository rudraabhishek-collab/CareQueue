import jwt from 'jsonwebtoken';

export const TEST_JWT_SECRET = 'test-secret-not-for-production';

/**
 * Signs a token with the given claims, using the test JWT secret by default.
 * Allows simulating expired tokens, missing claims, and wrong signatures.
 *
 * @param {object} options
 * @param {string|number} options.sub - Subject (user id).
 * @param {string} options.role - Role claim.
 * @param {string} [options.secret] - Override secret (for invalid-signature tests).
 * @param {string|number} [options.expiresIn] - Token lifetime.
 * @returns {string} Signed JWT.
 */
export function signToken({ sub, role, secret = TEST_JWT_SECRET, expiresIn = '1h' }) {
  return jwt.sign({ role }, secret, { subject: String(sub), expiresIn });
}

/**
 * Inserts a user directly (any role) with a hashed password.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {object} options
 * @param {string} options.phone - Phone (already normalized).
 * @param {string} options.role - patient | doctor | staff | admin.
 * @param {string} [options.name] - Display name.
 * @param {string|null} [options.passwordHash] - bcrypt hash (null allowed).
 * @returns {{ id: number, phone: string, role: string, name: string }}
 */
export function insertUser(db, { phone, role, name = 'Direct User', passwordHash = null }) {
  const { lastInsertRowid: id } = db
    .prepare('INSERT INTO users (phone, password_hash, role, name) VALUES (?, ?, ?, ?)')
    .run(phone, passwordHash, role, name);
  return { id: Number(id), phone, role, name };
}
