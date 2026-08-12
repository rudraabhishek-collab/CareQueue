import test from 'node:test';
import assert from 'node:assert/strict';
import { HttpError } from '../../backend/utils/http-error.js';
import {
  checkLoginAttempt,
  recordLoginFailure,
  clearLoginFailures,
  MAX_LOGIN_FAILURES,
} from '../../backend/utils/login-limiter.js';

const PHONE = '+919999999999';

test('limiter allows attempts below the threshold', () => {
  for (let i = 0; i < MAX_LOGIN_FAILURES - 1; i += 1) {
    recordLoginFailure(PHONE);
    assert.doesNotThrow(() => checkLoginAttempt(PHONE), `attempt ${i + 1}`);
  }
  clearLoginFailures(PHONE);
});

test('limiter blocks once the failure threshold is reached', () => {
  for (let i = 0; i < MAX_LOGIN_FAILURES; i += 1) recordLoginFailure(PHONE);
  assert.throws(
    () => checkLoginAttempt(PHONE),
    (err) => err instanceof HttpError && err.status === 429
  );
  clearLoginFailures(PHONE);
});

test('successful login clears the failure counter', () => {
  for (let i = 0; i < MAX_LOGIN_FAILURES; i += 1) recordLoginFailure(PHONE);

  clearLoginFailures(PHONE);
  assert.doesNotThrow(() => checkLoginAttempt(PHONE), 'counter cleared, attempts allowed again');

  // And a fresh failure cycle still throttles.
  recordLoginFailure(PHONE);
  assert.doesNotThrow(() => checkLoginAttempt(PHONE));
  clearLoginFailures(PHONE);
});

test('phones are throttled independently', () => {
  const other = '+919000000000';
  for (let i = 0; i < MAX_LOGIN_FAILURES; i += 1) recordLoginFailure(PHONE);

  assert.doesNotThrow(() => checkLoginAttempt(other), 'unrelated phone is not throttled');
  clearLoginFailures(PHONE);
  clearLoginFailures(other);
});
