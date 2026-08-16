/**
 * Pure triage engine - deterministic decision-support system.
 *
 * IMPORTANT:
 * - NO randomness (Math.random, random(), time-dependent scoring)
 * - All inputs/outputs are explicit/dependencies
 * - Same input + same symptom catalog = identical result
 * - NO access to Express, HTTP, database, JWT, filesystem
 *
 * This module exports pure functions only. All database/persistence
 * concerns are handled by the repository layer.
 */

/**
 * Base symptom scores from the database seed.
 * These are demonstration values only, not clinically validated.
 */
const BASE_SCORES = {
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

/**
 * Symptom codes that have red_flag = 1 in the database.
 * These trigger emergency classification.
 */
const RED_FLAG_CODES = new Set(['chest', 'burn', 'bite']);

/**
 * Age modifiers - deterministic demonstration rules.
 * Applied AFTER red-flag check (emergency classification always takes precedence).
 */
const AGE_MODIFIERS = {
  under3: { score: 10, reason: 'age_under_3' },
  over65: { score: 10, reason: 'age_over_65' },
};

/**
 * Emergency keywords - case-insensitive, deterministic matching.
 * These are free-text keyword concepts, not NLP.
 */
const EMERGENCY_KEYWORDS = new Set([
  'breathing difficulty',
  'difficulty breathing',
  'shortness of breath',
  'fainting',
  'unconscious',
  'severe bleeding',
]);

/**
 * Scoring formula:
 *   1. total = sum of selected symptom base scores
 *   2. Apply age modifiers if applicable
 *   3. Total is the final score
 *
 * Red flags override normal scoring entirely.
 *
 * @param {object} input - { symptoms: string[], description?: string, age?: number, gender?: string }
 * @param {object} catalog - { [code]: baseScore } symptom catalog mapping
 * @returns {object} - { severity, priority, score, breakdown, isEmergency, careLevel, disclaimer }
 */
export function assessTriage(input, catalog = BASE_SCORES) {
  const { symptoms, age } = input;

  // 1. Validate symptoms exist in catalog
  const missing = symptoms.filter((code) => !(code in catalog));
  if (missing.length > 0) {
    throw new Error(`UNKNOWN_SYMPTOM: Unknown symptom code(s): ${missing.join(', ')}`);
  }

  // 2. Check for red flags in symptom codes
  const redFlags = symptoms.filter((code) => RED_FLAG_CODES.has(code));

  // 3. If red flag detected, emergency classification (takes precedence)
  if (redFlags.length > 0) {
    const breakdown = {
      symptoms: symptoms.map((code) => ({
        code,
        baseScore: catalog[code],
      })),
      modifiers: [],
      redFlags: redFlags.map((code) => ({
        code,
        reason: 'red_flag',
      })),
      total: catalog[redFlags[0]], // red flag score
    };

    return {
      severity: 'EMERGENCY',
      priority: 0,
      score: catalog[redFlags[0]],
      breakdown,
      isEmergency: true,
      careLevel: 'EMERGENCY',
      disclaimer: buildDisclaimer(true),
    };
  }

  // 4. No red flags: calculate score from symptoms
  const total = symptoms.reduce((sum, code) => sum + (catalog[code] || 0), 0);

  // 5. Apply age modifiers (deterministic, after red-flag check)
  const modifiers = [];
  let adjustedScore = total;

  if (age !== undefined && age !== null) {
    if (age <= 3) {
      adjustedScore += AGE_MODIFIERS.under3.score;
      modifiers.push({
        reason: AGE_MODIFIERS.under3.reason,
        score: AGE_MODIFIERS.under3.score,
      });
    }
    if (age >= 65) {
      adjustedScore += AGE_MODIFIERS.over65.score;
      modifiers.push({
        reason: AGE_MODIFIERS.over65.reason,
        score: AGE_MODIFIERS.over65.score,
      });
    }
  }

  // 6. Determine severity based on score thresholds
  let severity, priority, careLevel;
  if (adjustedScore >= 80) {
    severity = 'EMERGENCY';
    priority = 0;
    careLevel = 'EMERGENCY';
  } else if (adjustedScore >= 50) {
    severity = 'URGENT';
    priority = 1;
    careLevel = 'TERTIARY';
  } else if (adjustedScore >= 25) {
    severity = 'MODERATE';
    priority = 2;
    careLevel = 'PHC';
  } else {
    severity = 'MILD';
    priority = 3;
    careLevel = 'PHC';
  }

  const breakdown = {
    symptoms: symptoms.map((code) => ({
      code,
      baseScore: catalog[code],
    })),
    modifiers,
    redFlags: [], // no red flags detected
    total: adjustedScore,
  };

  return {
    severity,
    priority,
    score: adjustedScore,
    breakdown,
    isEmergency: false,
    careLevel,
    disclaimer: buildDisclaimer(false),
  };
}

/**
 * Detects emergency from free-text description using keyword matching.
 * Case-insensitive, deterministic.
 *
 * @param {string} description - Free-text description
 * @returns {boolean} - true if emergency keyword detected
 */
export function detectEmergencyFromDescription(description) {
  if (typeof description !== 'string') return false;

  const lower = description.toLowerCase();

  for (const keyword of EMERGENCY_KEYWORDS) {
    if (lower.includes(keyword)) {
      return true;
    }
  }

  return false;
}

/**
 * Builds the safety disclaimer text.
 *
 * @param {boolean} isEmergency - whether the result is an emergency
 * @returns {string} disclaimer text
 */
function buildDisclaimer(isEmergency) {
  const base =
    'This is a demonstration triage system and is not a medical diagnosis. It does not replace professional medical care.';

  if (isEmergency) {
    return base + ' Seek immediate emergency medical care.';
  }

  return base;
}

/**
 * Validates that the triage input is appropriate for the pure engine.
 * Meant to be called by the controller/service layer.
 *
 * @param {object} input - { symptoms, description, age, gender }
 * @returns {string[]} - list of validation errors (empty if valid)
 */
export function validateInput(input) {
  const errors = [];

  if (!input || typeof input !== 'object') {
    errors.push('Input must be an object');
    return errors;
  }

  if (!Array.isArray(input.symptoms)) {
    errors.push('Symptoms must be an array');
  } else if (input.symptoms.length === 0) {
    errors.push('At least one symptom is required');
  }

  if (input.age !== undefined && input.age !== null) {
    if (!Number.isInteger(input.age)) {
      errors.push('Age must be an integer');
    } else if (input.age < 0) {
      errors.push('Age must not be negative');
    } else if (input.age > 120) {
      errors.push('Age must not exceed 120');
    }
  }

  if (input.description !== undefined && input.description !== null) {
    if (input.description.length > 500) {
      errors.push('Description must not exceed 500 characters');
    }
  }

  return errors;
}
