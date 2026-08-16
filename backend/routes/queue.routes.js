import { Router } from 'express';
import { createQueueService } from '../services/queue.service.js';

/**
 * Assembles the /api/v1/queue router.
 *
 * Queue operations (token creation, department queue view, call-next,
 * status actions). Token look-up/cancel live under /api/v1/tokens.
 *
 * @param {object} deps
 * @param {import('better-sqlite3').Database} deps.db - Open SQLite connection
 * @param {import('express').RequestHandler} deps.requireAuth - JWT middleware
 */
export function createQueueRouter({ db, requireAuth }) {
  const service = createQueueService({ db });
  const router = Router();

  /**
   * POST /api/v1/queue/tokens
   * Patient creates a token after triage. Requires auth.
   */
  router.post('/tokens', requireAuth, service.createToken);

  /**
   * POST /api/v1/queue/status-action
   * Doctor/staff performs a state action (call/start/complete/no-show). Requires auth.
   */
  router.post('/status-action', requireAuth, service.doctorStateAction);

  /**
   * GET /api/v1/queue/:hospitalId/:departmentId
   * Doctor/staff view the queue for a department. Requires auth.
   */
  router.get('/:hospitalId/:departmentId', requireAuth, service.getQueue);

  /**
   * POST /api/v1/queue/:hospitalId/:departmentId/call-next
   * Doctor/staff calls the next patient. Requires auth.
   */
  router.post('/:hospitalId/:departmentId/call-next', requireAuth, service.callNext);

  return router;
}
