import { Router } from 'express';
import { createPatientController } from '../controllers/patient.controller.js';

/**
 * Assembles the /api/v1/patients router.
 *
 * Every route requires a valid patient-role token. The authenticated user's
 * id drives all lookups; a client can never address another patient by id.
 *
 * @param {object} deps
 * @param {import('better-sqlite3').Database} deps.db - Open SQLite connection.
 * @param {import('express').RequestHandler} deps.requireAuth - JWT middleware.
 * @param {import('express').RequestHandler} deps.requireRole - Role middleware.
 */
export function createPatientRouter({ db, requireAuth, requireRole }) {
  const controller = createPatientController({ db });
  const router = Router();

  const patientOnly = [requireAuth, requireRole('patient')];

  /**
   * POST /api/v1/patients
   * Creates a patient profile for the authenticated user.
   */
  router.post('/', patientOnly, controller.createPatient);

  /**
   * GET /api/v1/patients/me
   * Returns the authenticated patient's profile + recent triage.
   */
  router.get('/me', patientOnly, controller.getMyPatient);

  /**
   * PATCH /api/v1/patients/me
   * Partially updates the authenticated patient's profile.
   */
  router.patch('/me', patientOnly, controller.updateMyPatient);

  return router;
}
