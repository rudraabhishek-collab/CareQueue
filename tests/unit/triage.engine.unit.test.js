import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessTriage,
  detectEmergencyFromDescription,
  validateInput,
} from '../../backend/services/triage.service.js';

const CATALOG = {
  fever: 20,
  cough: 10,
  chest: 70,
  injury: 45,
  back: 25,
  dental: 20,
  throat: 10,
  ear: 20,
  diarrhea: 30,
  fatigue: 25,
  vomit: 35,
  burn: 60,
  bite: 55,
  acidity: 15,
  urine: 35,
  stress: 20,
};

// Score thresholds: <25=MILD, 25-49=MODERATE, 50-79=URGENT, >=80=EMERGENCY

test('one symptom fever is MILD (score 20 < 25)', () => {
  const result = assessTriage({ symptoms: ['fever'] }, CATALOG);
  assert.strictEqual(result.severity, 'MILD');
  assert.strictEqual(result.score, 20);
  assert.strictEqual(result.priority, 3);
  assert.strictEqual(result.isEmergency, false);
});

test('two symptoms fever+cough is MODERATE (score 30, >= 25)', () => {
  const result = assessTriage({ symptoms: ['fever', 'cough'] }, CATALOG);
  assert.strictEqual(result.severity, 'MODERATE');
  assert.strictEqual(result.score, 30);
  assert.strictEqual(result.priority, 2);
});

test('unknown symptom throws', () => {
  assert.throws(() => assessTriage({ symptoms: ['unknown'] }, CATALOG), /UNKNOWN_SYMPTOM/);
});

test('chest pain is emergency (red flag)', () => {
  const result = assessTriage({ symptoms: ['chest'] }, CATALOG);
  assert.strictEqual(result.severity, 'EMERGENCY');
  assert.strictEqual(result.priority, 0);
  assert.strictEqual(result.isEmergency, true);
  assert.strictEqual(result.careLevel, 'EMERGENCY');
});

test('burn is emergency (red flag)', () => {
  const result = assessTriage({ symptoms: ['burn'] }, CATALOG);
  assert.strictEqual(result.severity, 'EMERGENCY');
  assert.strictEqual(result.isEmergency, true);
  assert.strictEqual(result.priority, 0);
});

test('age 0 gives under-3 modifier (20+10=30, MODERATE)', () => {
  const result = assessTriage({ symptoms: ['fever'], age: 0 }, CATALOG);
  assert.strictEqual(result.score, 30);
  assert.strictEqual(result.severity, 'MODERATE');
  assert.strictEqual(result.priority, 2);
});

test('age 3 gives under-3 modifier', () => {
  const result = assessTriage({ symptoms: ['fever'], age: 3 }, CATALOG);
  assert.strictEqual(result.score, 30);
});

test('age 4 no modifier (score 20, MILD)', () => {
  const result = assessTriage({ symptoms: ['fever'], age: 4 }, CATALOG);
  assert.strictEqual(result.score, 20);
  assert.strictEqual(result.severity, 'MILD');
  assert.strictEqual(result.priority, 3);
});

test('age 65 gives over-65 modifier (20+10=30, MODERATE)', () => {
  const result = assessTriage({ symptoms: ['fever'], age: 65 }, CATALOG);
  assert.strictEqual(result.score, 30);
  assert.strictEqual(result.severity, 'MODERATE');
});

test('determinism identical input produces identical result', () => {
  const input = { symptoms: ['fever', 'cough'], age: 21 };
  const r1 = assessTriage(input, CATALOG);
  const r2 = assessTriage(input, CATALOG);
  assert.deepStrictEqual(r1, r2);
});

test('cough alone is MILD (score 10 < 25)', () => {
  const result = assessTriage({ symptoms: ['cough'] }, CATALOG);
  assert.strictEqual(result.severity, 'MILD');
  assert.strictEqual(result.priority, 3);
});

test('disclaimer present in all results', () => {
  const r = assessTriage({ symptoms: ['fever'] }, CATALOG);
  assert.strictEqual(typeof r.disclaimer, 'string');
  assert.ok(r.disclaimer.includes('demonstration'));
});

test('emergency disclaimer has care guidance', () => {
  const r = assessTriage({ symptoms: ['chest'] }, CATALOG);
  assert.ok(r.disclaimer.includes('Seek immediate emergency medical care'));
});

test('validateInput valid returns empty errors', () => {
  const errors = validateInput({ symptoms: ['fever'], age: 25 });
  assert.strictEqual(errors.length, 0);
});

test('validateInput missing symptoms error', () => {
  const errors = validateInput({});
  assert.ok(errors.length > 0);
});

test('validateInput negative age error', () => {
  const errors = validateInput({ symptoms: ['fever'], age: -1 });
  assert.ok(
    errors.some((e) => e.includes('negative')) ||
      errors.some((e) => e.includes('must not be negative'))
  );
});

test('validateInput age 121 error', () => {
  const errors = validateInput({ symptoms: ['fever'], age: 121 });
  assert.ok(errors.some((e) => e.includes('120')) || errors.some((e) => e.includes('exceed')));
});

test('detectEmergencyFromDescription keyword', () => {
  assert.strictEqual(detectEmergencyFromDescription('difficulty breathing'), true);
  assert.strictEqual(detectEmergencyFromDescription('SEVERE BLEEDING'), true);
  assert.strictEqual(detectEmergencyFromDescription('no emergency'), false);
  assert.strictEqual(detectEmergencyFromDescription('shortness of breath'), true);
  assert.strictEqual(detectEmergencyFromDescription('fainting'), true);
  assert.strictEqual(detectEmergencyFromDescription('unconscious'), true);
});

test('red flag chest pain overrides age modifiers', () => {
  // chest pain is red flag → emergency regardless of age
  const r1 = assessTriage({ symptoms: ['chest'], age: 0 }, CATALOG);
  assert.strictEqual(r1.isEmergency, true);
  assert.strictEqual(r1.severity, 'EMERGENCY');

  const r2 = assessTriage({ symptoms: ['chest'], age: 65 }, CATALOG);
  assert.strictEqual(r2.isEmergency, true);
  assert.strictEqual(r2.severity, 'EMERGENCY');
});

test('back pain (no red flag, score 25) is MODERATE boundary', () => {
  const result = assessTriage({ symptoms: ['back'] }, CATALOG);
  assert.strictEqual(result.severity, 'MODERATE');
  assert.strictEqual(result.score, 25);
  assert.strictEqual(result.priority, 2);
});
