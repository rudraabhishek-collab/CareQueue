import { randomUUID } from 'node:crypto';

/**
 * Assigns a request ID and logs method, path, status and duration.
 *
 * Request bodies are intentionally NOT logged to avoid capturing
 * passwords, OTPs or sensitive patient data.
 *
 * @param {import('pino').Logger} logger - Pino logger instance.
 * @returns {import('express').RequestHandler} Express middleware.
 */
export function requestLogger(logger) {
  return (req, res, next) => {
    req.id = req.headers['x-request-id'] || randomUUID();
    const start = process.hrtime.bigint();

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      logger.info(
        {
          reqId: req.id,
          method: req.method,
          path: req.originalUrl,
          status: res.statusCode,
          durationMs,
        },
        'request completed'
      );
    });

    next();
  };
}
