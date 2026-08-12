import { HttpError } from './http-error.js';

/**
 * Development/MVP login failure limiter.
 *
 * Simple in-memory throttle keyed by normalized phone. It stops obvious
 * brute-force during development but is NOT production-grade: it is
 * single-process, not shared across instances, and not IP-aware. A
 * production deployment needs a shared store (e.g. Redis).
 *
 * Limits per phone: 5 failed logins per rolling 15-minute window, with a
 * 60-second cooldown between allowed retries once the limit is hit. A
 * successful login clears the failure counter.
 */

export const MAX_LOGIN_FAILURES = 5;
export const WINDOW_MS = 15 * 60 * 1000;
export const FAILURE_COOLDOWN_MS = 60 * 1000;

/** @type {Map<string, { count: number, firstFailureAt: number, lastFailureAt: number }>} */
const loginFailures = new Map();

/**
 * Throws 429 TOO_MANY_ATTEMPTS when the phone is currently throttled.
 *
 * @param {string} phone - Normalized phone.
 */
export function checkLoginAttempt(phone) {
  const entry = loginFailures.get(phone);
  if (!entry) return;

  const now = Date.now();
  if (now - entry.firstFailureAt > WINDOW_MS) {
    loginFailures.delete(phone);
    return;
  }
  if (entry.count >= MAX_LOGIN_FAILURES && now - entry.lastFailureAt < FAILURE_COOLDOWN_MS) {
    throw new HttpError(
      429,
      'TOO_MANY_ATTEMPTS',
      'Too many failed login attempts. Please try again later.'
    );
  }
}

/**
 * Records a failed login attempt for a phone.
 *
 * @param {string} phone - Normalized phone.
 */
export function recordLoginFailure(phone) {
  const now = Date.now();
  const entry = loginFailures.get(phone) || { count: 0, firstFailureAt: now, lastFailureAt: now };
  entry.count += 1;
  entry.lastFailureAt = now;
  loginFailures.set(phone, entry);
  if (loginFailures.size > 1000) sweepExpired();
}

/**
 * Clears the failure counter for a phone (called after a successful login).
 *
 * @param {string} phone - Normalized phone.
 */
export function clearLoginFailures(phone) {
  loginFailures.delete(phone);
}

/** Removes expired entries to bound memory. */
function sweepExpired() {
  const now = Date.now();
  for (const [phone, entry] of loginFailures) {
    if (now - entry.firstFailureAt > WINDOW_MS) loginFailures.delete(phone);
  }
}
