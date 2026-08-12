/**
 * Application error with an HTTP status and a stable error code.
 * Used to signal expected failures (validation, conflicts, auth, etc.)
 * so the centralized error handler can render them consistently.
 */
export class HttpError extends Error {
  /**
   * @param {number} status - HTTP status code.
   * @param {string} code - Stable machine-readable error code.
   * @param {string} message - Human-readable error message.
   * @param {Array<object>} [details] - Optional structured error details.
   */
  constructor(status, code, message, details = []) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
