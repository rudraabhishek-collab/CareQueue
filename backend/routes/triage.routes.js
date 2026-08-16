import { Router } from 'express';
import { createTriageController } from '../controllers/triage.controller.js';

/**
 * Assembles the /api/v1/triage router.
 *
 * @param {object} deps
 * @param {import('better-sqlite3').Database} deps.db - Open SQLite connection
 * @param {object} deps.config - Application config
 * @param {import('express').RequestHandler} deps.requireAuth - JWT middleware
 */
export function createTriageRouter({ db, config, requireAuth }) {
  const controller = createTriageController({ db, config });
  const router = Router();

  /**
   * POST /api/v1/triage/assess
   * Requires: Bearer JWT, patient role
   */
  router.post('/assess', requireAuth, controller.assess);

  /**
   * GET /api/v1/triage/assessments/me
   * Requires: Bearer JWT, patient role
   */
  router.get('/assessments/me', requireAuth, controller.assessmentsMe);

  /**
   * GET /api/v1/triage/assessments/:id
   * Requires: Bearer JWT, patient role (ownership checked in controller)
   */
  router.get('/assessments/:id', requireAuth, controller.assessmentById);

  return router;
}
