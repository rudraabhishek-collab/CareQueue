import { Router } from 'express';
import { healthController } from '../controllers/health.controller.js';
import { authRouter } from './auth.routes.js';
import { devTestRouter } from './dev-test.routes.js';
import { createTriageRouter } from './triage.routes.js';
import { createQueueRouter } from './queue.routes.js';
import { createTokenRouter } from './tokens.routes.js';
import { createPatientRouter } from './patient.routes.js';
import { createAuthService } from '../services/auth.service.js';
import { createAuthController } from '../controllers/auth.controller.js';
import { createAuthMiddleware } from '../middleware/auth.js';

/**
 * Assembles the /api/v1 router.
 *
 * @param {object} deps
 * @param {object} deps.config - Application config.
 * @param {import('better-sqlite3').Database} deps.db - Open SQLite connection.
 * @param {import('pino').Logger} deps.logger - Pino logger instance.
 * @returns {import('express').Router} The API router.
 */
export function apiRouter({ config, db }) {
  const router = Router();

  const authService = createAuthService({ db, config });
  const authController = createAuthController({ auth: authService });
  const { requireAuth, requireRole } = createAuthMiddleware({
    db,
    jwtSecret: config.jwtSecret,
  });

  router.get('/health', healthController.health);
  router.get('/health/db', healthController.healthDb);
  router.use('/auth', authRouter({ authController, requireAuth }));

  const triageRouter = createTriageRouter({ db, config, requireAuth });
  router.use('/triage', triageRouter);

  const queueRouter = createQueueRouter({ db, requireAuth });
  router.use('/queue', queueRouter);

  const tokenRouter = createTokenRouter({ db, requireAuth });
  router.use('/tokens', tokenRouter);

  const patientRouter = createPatientRouter({ db, requireAuth, requireRole });
  router.use('/patients', patientRouter);

  if (config.nodeEnv !== 'production') {
    router.use('/_dev', devTestRouter({ requireAuth, requireRole }));
  }

  return router;
}
