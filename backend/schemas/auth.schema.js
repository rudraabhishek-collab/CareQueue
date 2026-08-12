import { z } from 'zod';
import { normalizePhone } from '../utils/phone.js';

/**
 * Shared phone field. Format is validated here so malformed input is
 * rejected as VALIDATION_ERROR before any authentication logic runs.
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
 * Registration payload.
 *
 * `.strict()` rejects unknown fields, so a client can never smuggle in a
 * `role` (or any other) claim. New accounts are always role `patient`.
 *
 * bcrypt only uses the first 72 bytes, so passwords are capped at 72 chars.
 */
export const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Name is required').max(100, 'Name is too long'),
    phone: phoneField,
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(72, 'Password is too long'),
  })
  .strict();

/**
 * Login payload. `.strict()` rejects unknown fields.
 */
export const loginSchema = z
  .object({
    phone: phoneField,
    password: z.string().min(1, 'Password is required').max(72, 'Password is too long'),
  })
  .strict();
