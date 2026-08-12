import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../../backend/utils/password.js';
import { normalizePhone } from '../../backend/utils/phone.js';

test('hashPassword never returns the plaintext password', async () => {
  const password = 'SuperSecret123';
  const hash = await hashPassword(password);
  assert.notEqual(hash, password);
  assert.match(hash, /^\$2[aby]\$/);
});

test('verifyPassword matches the correct password', async () => {
  const hash = await hashPassword('SuperSecret123');
  assert.equal(await verifyPassword('SuperSecret123', hash), true);
  assert.equal(await verifyPassword('WrongPassword', hash), false);
});

test('same password produces different hashes (random salt)', async () => {
  const [hashA, hashB] = await Promise.all([
    hashPassword('SamePassword'),
    hashPassword('SamePassword'),
  ]);
  assert.notEqual(hashA, hashB);
});

test('verifyPassword handles a null/undefined hash safely', async () => {
  assert.equal(await verifyPassword('anything', null), false);
  assert.equal(await verifyPassword('anything', undefined), false);
});

test('normalizePhone canonicalizes Indian number formats', () => {
  assert.equal(normalizePhone('9999999999'), '+919999999999');
  assert.equal(normalizePhone(' 9999999999 '), '+919999999999');
  assert.equal(normalizePhone('+919999999999'), '+919999999999');
  assert.equal(normalizePhone('919999999999'), '+919999999999');
  assert.equal(normalizePhone('09999999999'), '+919999999999');
  assert.equal(normalizePhone('+91 99999 99999'), '+919999999999');
  assert.equal(normalizePhone('+91-99999-99999'), '+919999999999');
  assert.equal(normalizePhone('(999) 999-9999'), '+919999999999');
});

test('normalizePhone rejects invalid numbers', () => {
  assert.equal(normalizePhone(''), null);
  assert.equal(normalizePhone('   '), null);
  assert.equal(normalizePhone('123456'), null);
  assert.equal(normalizePhone('1234567890'), null, 'must start with 6-9');
  assert.equal(normalizePhone('999999999'), null, 'too short');
  assert.equal(normalizePhone('+1 415 555 0000'), null, 'foreign number');
  assert.equal(normalizePhone('abc'), null);
  assert.equal(normalizePhone(null), null);
  assert.equal(normalizePhone(undefined), null);
});
