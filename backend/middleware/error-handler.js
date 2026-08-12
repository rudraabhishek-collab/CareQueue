/**
 * Standard 404 response for unmatched routes.
 *
 * @type {import('express').RequestHandler}
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route not found: ${req.method} ${req.originalUrl}`,
      details: [],
    },
  });
}

/**
 * Centralized error handler.
 *
 * Maps known error types to the standard error envelope and prevents
 * stack traces from leaking into responses.
 *
 * @param {object} [deps]
 * @param {import('pino').Logger} [deps.logger] - Pino logger instance.
 * @returns {import('express').ErrorRequestHandler} Express error middleware.
 */
export function errorHandler({ logger } = {}) {
  return (err, req, res, _next) => {
    let status = err.status || 500;
    let code = err.code || 'INTERNAL_ERROR';
    let message = err.message || 'Internal server error';
    let details = Array.isArray(err.details) ? err.details : [];

    if (err instanceof SyntaxError && err.type === 'entity.parse.failed') {
      status = 400;
      code = 'INVALID_JSON';
      message = 'Malformed JSON in request body';
      details = [];
    }

    if (err.name === 'ZodError' && err.issues) {
      status = 400;
      code = 'VALIDATION_ERROR';
      message = 'Invalid request';
      details = err.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
    }

    if (status >= 500) {
      (logger || console).error({ err, reqId: req.id }, 'unhandled error');
    }

    res.status(status).json({
      error: {
        code,
        message,
        details: status >= 500 ? [] : details,
      },
    });
  };
}
