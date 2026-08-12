/**
 * Health check endpoint.
 *
 * @type {object}
 */
export const healthController = {
  /**
   * GET /api/v1/health
   *
   * @param {import('express').Request} _req
   * @param {import('express').Response} res
   */
  health(_req, res) {
    res.json({ status: 'ok', service: 'carequeue-api' });
  },

  /**
   * GET /api/v1/health/db
   *
   * Runs a trivial query to confirm the database is reachable. Never exposes
   * database internals.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  healthDb(req, res, next) {
    try {
      req.app.locals.db.prepare('SELECT 1 AS ok').get();
      res.json({ data: { status: 'ok' } });
    } catch (err) {
      next(err);
    }
  },
};
