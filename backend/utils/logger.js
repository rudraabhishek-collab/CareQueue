import { pino } from 'pino';

/**
 * Creates a structured JSON logger.
 *
 * @param {string} level - Minimum log level ('silent' disables logging).
 */
export function createLogger(level = 'info') {
  return pino({ level });
}
