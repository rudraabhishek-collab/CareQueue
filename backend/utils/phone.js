/**
 * Phone normalization for the MVP.
 *
 * Accepts common representations of an Indian phone number and returns a
 * single canonical form: `+91` followed by the 10-digit number.
 *
 * Accepted inputs (after trimming):
 *   - `9999999999`             (10 digits starting 6-9)
 *   - `+919999999999`          (E.164 with 91 country code)
 *   - `919999999999`           (12 digits with 91 country code)
 *   - `09999999999`            (11 digits with leading 0)
 *   - `+91 99999 99999`        (spaces / dashes / dots / parens stripped)
 *
 * The canonical form is stored in the database so that multiple textual
 * representations of the same number never become separate users.
 *
 * @param {string} raw - Raw phone input.
 * @returns {string | null} Canonical `+91...` form, or null when invalid.
 */
export function normalizePhone(raw) {
  if (typeof raw !== 'string') return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  const cleaned = trimmed.replace(/[\s\-().]+/g, '');
  const hasPlus = cleaned.startsWith('+');
  const digits = cleaned.replace(/^\+/, '');

  if (!/^\d+$/.test(digits)) return null;

  let national = null;

  if (hasPlus) {
    if (digits.length === 12 && digits.startsWith('91')) {
      national = digits.slice(2);
    } else if (digits.length === 10) {
      national = digits;
    }
  } else if (digits.length === 10) {
    national = digits;
  } else if (digits.length === 11 && digits.startsWith('0')) {
    national = digits.slice(1);
  } else if (digits.length === 12 && digits.startsWith('91')) {
    national = digits.slice(2);
  }

  if (!national) return null;

  // Indian mobile numbers start with 6-9.
  if (!/^[6-9]\d{9}$/.test(national)) return null;

  return `+91${national}`;
}
