import { Router } from 'express';
import { createQueueService } from '../services/queue.service.js';

/**
 * Assembles the /api/v1/tokens router.
 *
 * Public token tracking by token number; cancel requires authentication.
 *
 * @param {object} deps
 * @param {import('better-sqlite3').Database} deps.db - Open SQLite connection
 * @param {import('express').RequestHandler} deps.requireAuth - JWT middleware
 */
export function createTokenRouter({ db, requireAuth }) {
  const service = createQueueService({ db });
  const router = Router();

  /**
   * GET /api/v1/tokens/:tokenNo
   * Get token details (public tracking by token number).
   */
  router.get('/:tokenNo', service.getToken);

  /**
   * POST /api/v1/tokens/:tokenNo/cancel
   * Patient cancels their token. Requires auth.
   */
  router.post('/:tokenNo/cancel', requireAuth, service.cancelToken);

  return router;
}
