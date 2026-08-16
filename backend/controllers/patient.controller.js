import { createPatientSchema, updatePatientSchema } from '../schemas/patient.schema.js';
import { createPatientService } from '../services/patient.service.js';
import { success } from '../utils/respond.js';

/**
 * Creates the patient controller.
 *
 * @param {object} deps
 * @param {import('better-sqlite3').Database} deps.db - Open SQLite connection.
 */
export function createPatientController({ db }) {
  const service = createPatientService({ db });

  return {
    /**
     * GET /api/v1/patients/me
     * Requires: Bearer JWT, patient role.
     */
    getMyPatient(req, res, next) {
      try {
        return success(res, service.getMyPatient(req.user.id));
      } catch (err) {
        return next(err);
      }
    },

    /**
     * POST /api/v1/patients
     * Requires: Bearer JWT, patient role. 201 when a profile is created.
     */
    createPatient(req, res, next) {
      try {
        const input = createPatientSchema.parse(req.body);
        const patient = service.createPatient(req.user.id, input, req.user.phone);
        return success(res, { patient }, 201);
      } catch (err) {
        return next(err);
      }
    },

    /**
     * PATCH /api/v1/patients/me
     * Requires: Bearer JWT, patient role.
     */
    updateMyPatient(req, res, next) {
      try {
        const input = updatePatientSchema.parse(req.body);
        const patient = service.updateMyPatient(req.user.id, input);
        return success(res, { patient });
      } catch (err) {
        return next(err);
      }
    },
  };
}
