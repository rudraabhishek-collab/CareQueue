import bcrypt from 'bcrypt';

/**
 * bcrypt cost factor. 12 is a reasonable default supported by the current
 * bcrypt version: strong enough for a production-style MVP without making
 * registration/login impractically slow.
 */
const BCRYPT_COST = 12;

/**
 * Hashes a plaintext password. Never store or log the plaintext value.
 *
 * @param {string} plaintext - Plaintext password (max 72 bytes enforced by bcrypt).
 * @returns {Promise<string>} bcrypt hash (includes salt).
 */
export function hashPassword(plaintext) {
  return bcrypt.hash(plaintext, BCRYPT_COST);
}

/**
 * Compares a plaintext password against a stored bcrypt hash.
 *
 * @param {string} plaintext - Candidate plaintext password.
 * @param {string} hash - Stored bcrypt hash.
 * @returns {Promise<boolean>} True when the password matches.
 */
export function verifyPassword(plaintext, hash) {
  if (!hash) return Promise.resolve(false);
  return bcrypt.compare(plaintext, hash);
}
