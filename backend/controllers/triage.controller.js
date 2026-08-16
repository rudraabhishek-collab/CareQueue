import { triageInputSchema, validateSymptomCodes } from '../schemas/triage.schema.js';
import {
  assessTriage,
  detectEmergencyFromDescription,
  validateInput,
} from '../services/triage.service.js';
import { HttpError } from '../utils/http-error.js';
import { success } from '../utils/respond.js';
import { TriageRepository } from '../repositories/triage.repository.js';

export function createTriageController({ db, _config }) {
  const repository = new TriageRepository();

  async function assess(req, res, next) {
    try {
      const authenticatedPatient = req.user;
      if (authenticatedPatient.role !== 'patient') {
        return next(
          new HttpError(403, 'FORBIDDEN', 'Only patients can perform triage assessments')
        );
      }

      const patient = db
        .prepare('SELECT id, name, age, gender, phone, abha_id FROM patients WHERE user_id = ?')
        .get(authenticatedPatient.id);

      if (!patient) {
        return next(
          new HttpError(
            404,
            'PATIENT_PROFILE_NOT_FOUND',
            'Patient profile not found for authenticated user'
          )
        );
      }

      const input = triageInputSchema.parse(req.body);

      const inputValidation = validateInput(input);
      if (inputValidation.length > 0) {
        return next(new HttpError(400, 'VALIDATION_ERROR', inputValidation[0]));
      }

      validateSymptomCodes(input.symptoms);

      const description = input.description || '';
      const hasEmergencyKeyword = detectEmergencyFromDescription(description);

      const result = assessTriage({
        symptoms: input.symptoms,
        description,
        age: input.age,
        gender: input.gender,
      });

      let isEmergency = result.isEmergency;
      let severity = result.severity;
      let priority = result.priority;
      let breakdown = result.breakdown;

      if (hasEmergencyKeyword && !isEmergency) {
        isEmergency = true;
        severity = 'EMERGENCY';
        priority = 0;
        breakdown = {
          symptoms: input.symptoms.map((code) => ({
            code,
            baseScore: result.breakdown.symptoms[0] ? result.breakdown.symptoms[0].baseScore : 0,
          })),
          modifiers: result.breakdown.modifiers,
          redFlags: [{ code: 'keyword', reason: 'emergency_keyword' }],
          total: result.breakdown.total,
        };
      }

      const assessment = repository.createAssessment(db, {
        patientId: patient.id,
        symptomCodes: input.symptoms,
        description,
        severity,
        priority,
        score: breakdown.total,
        scoreBreakdown: breakdown,
        isEmergency,
      });

      const careLevel =
        severity === 'EMERGENCY' ? 'EMERGENCY' : severity === 'URGENT' ? 'TERTIARY' : 'PHC';

      const responseData = {
        assessment: {
          id: assessment.id,
          severity,
          priority,
          score: breakdown.total,
          breakdown,
          isEmergency,
          careLevel,
          disclaimer: result.disclaimer,
        },
      };

      return success(res, responseData);
    } catch (err) {
      if (err instanceof HttpError) {
        return next(err);
      }
      if (err.message && err.message.startsWith('UNKNOWN_SYMPTOM')) {
        return next(new HttpError(422, 'UNKNOWN_SYMPTOM', err.message));
      }
      return next(err);
    }
  }

  async function assessmentsMe(req, res, next) {
    try {
      const authenticatedPatient = req.user;
      if (authenticatedPatient.role !== 'patient') {
        return next(new HttpError(403, 'FORBIDDEN', 'Only patients can view their triage history'));
      }

      const patient = db
        .prepare('SELECT id FROM patients WHERE user_id = ?')
        .get(authenticatedPatient.id);

      if (!patient) {
        return next(
          new HttpError(
            404,
            'PATIENT_PROFILE_NOT_FOUND',
            'Patient profile not found for authenticated user'
          )
        );
      }

      const assessments = repository.getAssessmentsByPatient(db, patient.id);

      return success(res, { assessments });
    } catch (err) {
      return next(new HttpError(500, 'INTERNAL_ERROR', err.message));
    }
  }

  async function assessmentById(req, res, next) {
    try {
      const assessmentId = req.params.id;
      const authenticatedPatient = req.user;
      if (authenticatedPatient.role !== 'patient') {
        return next(new HttpError(403, 'FORBIDDEN', 'Only patients can view triage assessments'));
      }

      const patient = db
        .prepare('SELECT id FROM patients WHERE user_id = ?')
        .get(authenticatedPatient.id);

      if (!patient) {
        return next(new HttpError(404, 'PATIENT_PROFILE_NOT_FOUND', 'Patient profile not found'));
      }

      const assessment = db
        .prepare(
          `SELECT id, patient_id, symptom_codes, description, severity, priority, score, score_breakdown, is_emergency, created_at FROM triage_assessments WHERE id = ? AND patient_id = ?`
        )
        .get(assessmentId, patient.id);

      if (!assessment) {
        return next(
          new HttpError(404, 'NOT_FOUND', 'Triage assessment not found or access denied')
        );
      }

      return success(res, {
        assessment: {
          id: assessment.id,
          severity: assessment.severity,
          priority: assessment.priority,
          score: assessment.score,
          breakdown: JSON.parse(assessment.score_breakdown),
          isEmergency: assessment.is_emergency !== 0,
          careLevel:
            assessment.severity === 'EMERGENCY'
              ? 'EMERGENCY'
              : assessment.severity === 'URGENT'
                ? 'TERTIARY'
                : 'PHC',
          disclaimer:
            'This is a demonstration triage system and is not a medical diagnosis. It does not replace professional medical care.',
        },
      });
    } catch (err) {
      return next(new HttpError(500, 'INTERNAL_ERROR', err.message));
    }
  }

  return {
    assess,
    assessmentsMe,
    assessmentById,
  };
}
