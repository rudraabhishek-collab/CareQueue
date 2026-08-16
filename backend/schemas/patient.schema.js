import { z } from 'zod';
import { normalizePhone } from '../utils/phone.js';

/**
 * Shared phone field for the patient module.
 *
 * Mirrors the auth schema: the value is trimmed, length-checked, then
 * validated as an Indian mobile number. A malformed number is rejected as
 * VALIDATION_ERROR before any repository code runs.
 */
const phoneField = z
  .string()
  .trim()
  .min(5, 'Phone number is required')
  .max(20, 'Phone number is too long')
  .superRefine((value, ctx) => {
    if (!normalizePhone(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid phone number. Provide a valid Indian mobile number.',
      });
    }
  });

/**
 * Payload for creating a patient profile (POST /api/v1/patients).
 *
 * `.strict()` rejects unknown fields, so a client can never smuggle in
 * `userId`, `id`, `role`, `abhaId` or any other claim.
 *
 * `age` and `gender` stay optional because the registration flow creates a
 * profile with only name + phone; the client can fill them in later via PATCH.
 * `phone` is optional: when omitted the account phone is used.
 */
export const createPatientSchema = z
  .object({
    name: z.string().trim().min(2, 'Name is required').max(100, 'Name is too long'),
    age: z
      .number()
      .int('Age must be an integer')
      .min(0, 'Age must be at least 0')
      .max(120, 'Age must not exceed 120')
      .optional(),
    gender: z
      .string()
      .trim()
      .min(1, 'Gender is too short')
      .max(20, 'Gender is too long')
      .optional(),
    phone: phoneField.optional(),
  })
  .strict();

/**
 * Payload for updating a patient profile (PATCH /api/v1/patients/me).
 *
 * All fields are optional but at least one must be present. Immutable fields
 * (id, userId, passwordHash, role, abhaId, createdAt, updatedAt) are not in
 * the schema, so `.strict()` rejects them with VALIDATION_ERROR.
 */
export const updatePatientSchema = z
  .object({
    name: z.string().trim().min(2, 'Name is required').max(100, 'Name is too long').optional(),
    age: z
      .number()
      .int('Age must be an integer')
      .min(0, 'Age must be at least 0')
      .max(120, 'Age must not exceed 120')
      .optional(),
    gender: z
      .string()
      .trim()
      .min(1, 'Gender is too short')
      .max(20, 'Gender is too long')
      .optional(),
    phone: phoneField.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required for update');
