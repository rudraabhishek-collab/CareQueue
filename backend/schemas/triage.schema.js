import { z } from 'zod';

/**
 * Symptom code validation against the known catalog.
 * This list must match the 16 symptoms seeded in the database.
 */
const symptomCode = z.string().trim();

/**
 * Input payload for triage assessment.
 *
 * Symptoms:
 *   - required
 *   - array
 *   - minimum 1 item
 *   - each item must be a known symptom code
 *
 * Description:
 *   - optional
 *   - maximum 500 characters
 *
 * Age:
 *   - optional
 *   - integer
 *   - minimum 0
 *   - maximum 120
 *
 * Gender:
 *   - optional, follows existing project conventions
 */
export const triageInputSchema = z
  .object({
    symptoms: z
      .array(symptomCode)
      .nonempty('At least one symptom is required')
      .refine(
        (codes) => new Set(codes).size === codes.length,
        'Duplicate symptoms are not allowed'
      ),
    description: z
      .string()
      .trim()
      .max(500, 'Description must not exceed 500 characters')
      .optional(),
    age: z
      .number()
      .int('Age must be an integer')
      .min(0, 'Age must be at least 0')
      .max(120, 'Age must not exceed 120')
      .optional(),
    gender: z.string().trim().optional(),
  })
  .strict();

/**
 * Extracts and validates symptom codes from input.
 * Throws VALIDATION_ERROR if any code is unknown.
 */
export function validateSymptomCodes(codes) {
  const knownCodes = new Set([
    'fever',
    'cough',
    'chest',
    'injury',
    'back',
    'dental',
    'throat',
    'ear',
    'diarrhea',
    'fatigue',
    'vomit',
    'burn',
    'bite',
    'acidity',
    'urine',
    'stress',
  ]);

  const unknown = codes.filter((code) => !knownCodes.has(code));
  if (unknown.length > 0) {
    throw new Error(`UNKNOWN_SYMPTOM: Unknown symptom code(s): ${unknown.join(', ')}`);
  }
}

export { symptomCode };
