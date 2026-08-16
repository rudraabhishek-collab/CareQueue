import { HttpError } from '../utils/http-error.js';
import { normalizePhone } from '../utils/phone.js';
import { recordAudit } from './auth.service.js';
import { PatientRepository } from '../repositories/patient.repository.js';

/**
 * Number of recent triage assessments surfaced in GET /patients/me.
 */
const RECENT_TRIAGE_LIMIT = 5;

/**
 * Derives the care level hint from a severity, matching the triage module.
 */
function careLevelFor(severity) {
  if (severity === 'EMERGENCY') return 'EMERGENCY';
  if (severity === 'URGENT') return 'TERTIARY';
  return 'PHC';
}

/**
 * Creates the patient service bound to a database connection.
 *
 * @param {object} deps
 * @param {import('better-sqlite3').Database} deps.db
 */
export function createPatientService({ db }) {
  const repository = new PatientRepository();

  /**
   * Maps a patients row (snake_case) to the API shape (camelCase).
   * Never exposes user_id/abha_id internals beyond the approved fields.
   */
  function mapPatient(row) {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      age: row.age,
      gender: row.gender,
      phone: row.phone,
      abhaId: row.abha_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at ?? row.created_at,
    };
  }

  /**
   * Maps a triage_assessments row to the compact recent-triage shape.
   * Deliberately excludes description and score_breakdown.
   */
  function mapTriage(row) {
    return {
      id: row.id,
      severity: row.severity,
      priority: row.priority,
      score: row.score,
      isEmergency: row.is_emergency !== 0,
      careLevel: careLevelFor(row.severity),
      createdAt: row.created_at,
    };
  }

  /**
   * Normalizes a phone or throws VALIDATION_ERROR.
   * The schema validates first, so this is a defensive guard.
   */
  function normalize(input) {
    const normalized = normalizePhone(input);
    if (!normalized) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid phone number');
    }
    return normalized;
  }

  function getMyPatient(userId) {
    const patient = repository.findByUserId(db, userId);
    if (!patient) {
      throw new HttpError(404, 'PATIENT_NOT_FOUND', 'Patient profile not found');
    }

    const recentTriage = repository
      .findRecentTriageByPatientId(db, patient.id, RECENT_TRIAGE_LIMIT)
      .map(mapTriage);

    return { patient: mapPatient(patient), recentTriage };
  }

  function createPatient(userId, input, accountPhone) {
    const existing = repository.findByUserId(db, userId);
    if (existing) {
      throw new HttpError(409, 'PATIENT_EXISTS', 'Patient profile already exists');
    }

    const phone = input.phone ? normalize(input.phone) : accountPhone;

    let patient;
    try {
      patient = repository.create(db, {
        userId,
        name: input.name,
        age: input.age ?? null,
        gender: input.gender ?? null,
        phone,
      });
    } catch (err) {
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new HttpError(409, 'PHONE_IN_USE', 'Another patient already uses this phone number');
      }
      throw err;
    }

    recordAudit(db, {
      actorUserId: userId,
      action: 'PATIENT_CREATED',
      entityType: 'patient',
      entityId: patient.id,
      meta: { name: patient.name },
    });

    return mapPatient(patient);
  }

  function updateMyPatient(userId, input) {
    const patient = repository.findByUserId(db, userId);
    if (!patient) {
      throw new HttpError(404, 'PATIENT_NOT_FOUND', 'Patient profile not found');
    }

    const fields = {};
    if (input.name !== undefined) fields.name = input.name;
    if (input.age !== undefined) fields.age = input.age;
    if (input.gender !== undefined) fields.gender = input.gender;
    if (input.phone !== undefined) fields.phone = normalize(input.phone);

    let updated;
    try {
      updated = repository.update(db, patient.id, fields);
    } catch (err) {
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new HttpError(409, 'PHONE_IN_USE', 'Another patient already uses this phone number');
      }
      throw err;
    }

    recordAudit(db, {
      actorUserId: userId,
      action: 'PATIENT_UPDATED',
      entityType: 'patient',
      entityId: patient.id,
      meta: { changed: Object.keys(fields) },
    });

    return mapPatient(updated);
  }

  return {
    getMyPatient,
    createPatient,
    updateMyPatient,
  };
}
