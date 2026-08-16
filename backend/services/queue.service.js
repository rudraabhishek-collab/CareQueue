import { HttpError } from '../utils/http-error.js';
import { success } from '../utils/respond.js';

export function createQueueService({ db }) {
  /**
   * Generate a token number in format: <HOSPITAL_SLUG>-<DEPT_CODE>-<SEQ>
   * Sequence resets daily, starts at 1.
   * Atomic creation inside a transaction.
   */
  function generateToken(db, hospital, department, patientId, priority) {
    const today = new Date().toISOString().split('T')[0];

    const insertToken = db.prepare(`
      INSERT INTO tokens (token_no, hospital_id, department_id, issue_date)
      VALUES (?, ?, ?, ?)
    `);

    const insertQueueEntry = db.prepare(`
      INSERT INTO queue_entries (token_id, hospital_id, department_id, patient_id, priority, status, arrived_at)
      VALUES (?, ?, ?, ?, ?, 'WAITING', datetime('now'))
    `);

    const checkExisting = db.prepare(`
      SELECT MAX(CAST(SUBSTR(token_no, -5) AS INTEGER)) AS max_seq
      FROM tokens
      WHERE hospital_id = ? AND department_id = ? AND issue_date = ?
    `);

    return db.transaction(() => {
      // Get the max sequence for today
      const existing = checkExisting.get(hospital.id, department.id, today);
      const newSeq = (existing.max_seq || 0) + 1;
      const tokenNo = `${hospital.slug}-${department.code}-${newSeq.toString().padStart(5, '0')}`;

      // Insert token
      insertToken.run(tokenNo, hospital.id, department.id, today);

      // Get the token ID
      const tokenId = db.prepare('SELECT id FROM tokens WHERE token_no = ?').get(tokenNo).id;

      // Insert queue entry with the triage priority for this patient
      insertQueueEntry.run(tokenId, hospital.id, department.id, patientId, priority);

      return {
        tokenNo,
        tokenId,
        sequence: newSeq,
      };
    })();
  }

  /**
   * Patient creates a token after triage
   */
  async function createToken(req, res, next) {
    try {
      const user = req.user;

      if (user.role !== 'patient') {
        return next(new HttpError(403, 'FORBIDDEN', 'Only patients can create tokens'));
      }

      const { hospitalId, departmentId, triageId } = req.body;

      if (!hospitalId || !departmentId || !triageId) {
        return next(
          new HttpError(
            400,
            'VALIDATION_ERROR',
            'hospitalId, departmentId, and triageId are required'
          )
        );
      }

      // Verify triage assessment belongs to authenticated patient
      const patient = db.prepare('SELECT id FROM patients WHERE user_id = ?').get(user.id);
      if (!patient) {
        return next(new HttpError(404, 'PATIENT_PROFILE_NOT_FOUND', 'Patient profile not found'));
      }

      const triage = db
        .prepare('SELECT * FROM triage_assessments WHERE id = ? AND patient_id = ?')
        .get(triageId, patient.id);
      if (!triage) {
        return next(
          new HttpError(404, 'NOT_FOUND', 'Triage assessment not found or access denied')
        );
      }

      // Emergency triage MUST NOT receive a token
      if (triage.is_emergency !== 0) {
        return next(
          new HttpError(
            422,
            'EMERGENCY_TOKEN_NOT_ALLOWED',
            'Emergency cases do not receive OPD tokens. Seek immediate emergency medical care.'
          )
        );
      }

      // Verify hospital exists and is active
      const hospital = db.prepare('SELECT * FROM hospitals WHERE id = ?').get(hospitalId);
      if (!hospital || !hospital.active) {
        return next(new HttpError(404, 'NOT_FOUND', 'Hospital not found or inactive'));
      }

      // Verify department exists, belongs to hospital, and is active
      const department = db
        .prepare('SELECT * FROM departments WHERE id = ? AND hospital_id = ? AND active = 1')
        .get(departmentId, hospitalId);
      if (!department) {
        return next(
          new HttpError(
            404,
            'NOT_FOUND',
            'Department not found or does not belong to this hospital'
          )
        );
      }

      // Generate token and queue entry atomically
      const token = generateToken(db, hospital, department, patient.id, triage.priority);

      return success(res, {
        token: token.tokenNo,
        priority: triage.priority,
        message: 'Token created successfully',
      });
    } catch (err) {
      if (err instanceof HttpError) {
        return next(err);
      }
      return next(new HttpError(500, 'INTERNAL_ERROR', err.message));
    }
  }

  /**
   * Get token details
   */
  async function getToken(req, res, next) {
    try {
      const tokenNo = req.params.tokenNo;

      const token = db
        .prepare(
          `
        SELECT t.token_no, t.issue_date, t.hospital_id, t.department_id, t.id AS token_id,
               q.id AS queue_entry_id, q.status, q.priority, q.arrived_at,
               q.called_at, q.started_at, q.completed_at,
               h.name AS hospital_name, h.slug AS hospital_slug,
               d.name AS department_name, d.code AS department_code,
               p.name AS patient_name, p.id AS patient_id
        FROM tokens t
        JOIN queue_entries q ON q.token_id = t.id
        JOIN hospitals h ON h.id = t.hospital_id
        JOIN departments d ON d.id = t.department_id
        LEFT JOIN patients p ON p.id = q.patient_id
        WHERE t.token_no = ?
      `
        )
        .get(tokenNo);

      if (!token) {
        return next(new HttpError(404, 'NOT_FOUND', 'Token not found'));
      }

      // Position among waiting entries, ordered by (priority ASC, arrived_at ASC, id ASC)
      const positionRow = db
        .prepare(
          `
        SELECT COUNT(*) AS ahead
        FROM queue_entries q2
        WHERE q2.hospital_id = ? AND q2.department_id = ? AND q2.status = 'WAITING'
          AND (
            q2.priority < ?
            OR (q2.priority = ? AND q2.arrived_at < ?)
            OR (q2.priority = ? AND q2.arrived_at = ? AND q2.id < ?)
          )
      `
        )
        .get(
          token.hospital_id,
          token.department_id,
          token.priority,
          token.priority,
          token.arrived_at,
          token.priority,
          token.arrived_at,
          token.queue_entry_id
        );

      return success(res, {
        token: {
          tokenNo: token.token_no,
          status: token.status,
          priority: token.priority,
          position: (positionRow.ahead || 0) + 1,
          hospital: {
            name: token.hospital_name,
            slug: token.hospital_slug,
          },
          department: {
            name: token.department_name,
            code: token.department_code,
          },
          arrivedAt: token.arrived_at,
          calledAt: token.called_at,
          startedAt: token.started_at,
          completedAt: token.completed_at,
        },
        patient: token.patient_name ? { name: token.patient_name, id: token.patient_id } : null,
      });
    } catch (err) {
      return next(new HttpError(500, 'INTERNAL_ERROR', err.message));
    }
  }

  /**
   * Doctor views queue
   */
  async function getQueue(req, res, next) {
    try {
      const { hospitalId, departmentId } = req.params;

      // Verify hospital exists
      const hospital = db.prepare('SELECT * FROM hospitals WHERE id = ?').get(hospitalId);
      if (!hospital) {
        return next(new HttpError(404, 'NOT_FOUND', 'Hospital not found'));
      }

      // Verify department exists and belongs to hospital
      const department = db
        .prepare('SELECT * FROM departments WHERE id = ? AND hospital_id = ?')
        .get(departmentId, hospitalId);
      if (!department) {
        return next(
          new HttpError(
            404,
            'NOT_FOUND',
            'Department not found or does not belong to this hospital'
          )
        );
      }

      // Get waiting queue ordered by priority ASC, arrived_at ASC
      const waitingQueue = db
        .prepare(
          `
        SELECT q.id, t.token_no, q.priority, q.arrived_at,
               q.called_at, q.started_at, q.completed_at,
               p.name AS patient_name, p.id AS patient_id
        FROM queue_entries q
        JOIN tokens t ON q.token_id = t.id
        LEFT JOIN patients p ON q.patient_id = p.id
        WHERE q.hospital_id = ? AND q.department_id = ? AND q.status = 'WAITING'
        ORDER BY q.priority ASC, q.arrived_at ASC
      `
        )
        .all(hospitalId, departmentId);

      // Get called token
      const calledToken = db
        .prepare(
          `
        SELECT t.token_no, q.status, q.called_at, p.name AS patient_name, p.id AS patient_id
        FROM queue_entries q
        JOIN tokens t ON q.token_id = t.id
        LEFT JOIN patients p ON q.patient_id = p.id
        WHERE q.hospital_id = ? AND q.department_id = ? AND q.status = 'CALLED'
        ORDER BY q.called_at ASC
        LIMIT 1
      `
        )
        .get(hospitalId, departmentId);

      // Get in-consultation token
      const inConsultation = db
        .prepare(
          `
        SELECT t.token_no, q.status, q.started_at, p.name AS patient_name, p.id AS patient_id
        FROM queue_entries q
        JOIN tokens t ON q.token_id = t.id
        LEFT JOIN patients p ON q.patient_id = p.id
        WHERE q.hospital_id = ? AND q.department_id = ? AND q.status = 'IN_CONSULTATION'
        ORDER BY q.started_at ASC
        LIMIT 1
      `
        )
        .get(hospitalId, departmentId);

      return success(res, {
        hospital: { name: hospital.name, slug: hospital.slug },
        department: { name: department.name, code: department.code },
        waitingCount: waitingQueue.length,
        waitingQueue,
        calledToken,
        inConsultation,
      });
    } catch (err) {
      return next(new HttpError(500, 'INTERNAL_ERROR', err.message));
    }
  }

  /**
   * Doctor calls next patient
   */
  async function callNext(req, res, next) {
    try {
      const { hospitalId, departmentId } = req.params;
      const user = req.user;

      if (user.role !== 'doctor' && user.role !== 'staff') {
        return next(new HttpError(403, 'FORBIDDEN', 'Only doctors and staff can call next'));
      }

      // Verify department belongs to hospital
      const department = db
        .prepare('SELECT * FROM departments WHERE id = ? AND hospital_id = ?')
        .get(departmentId, hospitalId);
      if (!department) {
        return next(
          new HttpError(
            404,
            'NOT_FOUND',
            'Department not found or does not belong to this hospital'
          )
        );
      }

      const result = db.transaction(() => {
        // Find the first WAITING entry using priority ASC, arrived_at ASC
        const waitingEntry = db
          .prepare(
            `
          SELECT q.id, q.token_id, q.priority, q.arrived_at, q.status
          FROM queue_entries q
          WHERE q.hospital_id = ? AND q.department_id = ? AND q.status = 'WAITING'
          ORDER BY q.priority ASC, q.arrived_at ASC
          LIMIT 1
        `
          )
          .get(hospitalId, departmentId);

        if (!waitingEntry) {
          return { error: 'NO_WAITING_PATIENTS', calledToken: null };
        }

        // Update status to CALLED
        const now = new Date().toISOString();
        db.prepare("UPDATE queue_entries SET status = 'CALLED', called_at = ? WHERE id = ?").run(
          now,
          waitingEntry.id
        );

        const tokenNo = db
          .prepare('SELECT token_no FROM tokens WHERE id = ?')
          .get(waitingEntry.token_id).token_no;

        return {
          error: null,
          calledToken: {
            id: waitingEntry.id,
            tokenNo,
            priority: waitingEntry.priority,
            status: 'CALLED',
          },
        };
      })();

      if (result.error) {
        return next(new HttpError(409, 'CONFLICT', 'No waiting patients'));
      }

      return success(res, {
        calledToken: result.calledToken,
        message: 'Patient called successfully',
      });
    } catch (err) {
      return next(new HttpError(500, 'INTERNAL_ERROR', err.message));
    }
  }

  /**
   * Patient cancels their token
   */
  async function cancelToken(req, res, next) {
    try {
      const tokenNo = req.params.tokenNo;
      const user = req.user;

      if (user.role !== 'patient' && user.role !== 'staff') {
        return next(new HttpError(403, 'FORBIDDEN', 'Only patients and staff can cancel tokens'));
      }

      // Find the queue entry for this token
      const queueEntry = db
        .prepare(
          `
        SELECT q.*, p.user_id AS patient_user_id
        FROM queue_entries q
        JOIN tokens t ON q.token_id = t.id
        LEFT JOIN patients p ON q.patient_id = p.id
        WHERE t.token_no = ?
      `
        )
        .get(tokenNo);

      if (!queueEntry) {
        return next(new HttpError(404, 'NOT_FOUND', 'Token not found'));
      }

      // Patient can only cancel their own token
      if (user.role === 'patient' && queueEntry.patient_user_id !== user.id) {
        return next(new HttpError(403, 'FORBIDDEN', 'You can only cancel your own token'));
      }

      // Cancellation only allowed from WAITING state
      if (queueEntry.status !== 'WAITING') {
        return next(
          new HttpError(
            409,
            'CONFLICT',
            'Cannot cancel token in current state. Only WAITING tokens can be cancelled.'
          )
        );
      }

      db.prepare("UPDATE queue_entries SET status = 'CANCELLED' WHERE id = ?").run(queueEntry.id);

      return success(res, {
        message: 'Token cancelled successfully',
        status: 'CANCELLED',
      });
    } catch (err) {
      return next(new HttpError(500, 'INTERNAL_ERROR', err.message));
    }
  }

  /**
   * Doctor performs state action on queue entry
   */
  async function doctorStateAction(req, res, next) {
    try {
      const { queueEntryId, action } = req.body;
      const user = req.user;

      if (!queueEntryId || !action) {
        return next(new HttpError(400, 'VALIDATION_ERROR', 'queueEntryId and action are required'));
      }

      if (user.role !== 'doctor' && user.role !== 'staff') {
        return next(
          new HttpError(403, 'FORBIDDEN', 'Only doctors and staff can manage queue states')
        );
      }

      // Get the queue entry with hospital/department info
      const queueEntry = db
        .prepare(
          `
        SELECT q.id, q.token_id, q.hospital_id, q.department_id, q.priority, q.status, q.arrived_at,
               p.user_id AS patient_user_id
        FROM queue_entries q
        JOIN tokens t ON q.token_id = t.id
        LEFT JOIN patients p ON q.patient_id = p.id
        WHERE q.id = ?
      `
        )
        .get(queueEntryId);

      if (!queueEntry) {
        return next(new HttpError(404, 'NOT_FOUND', 'Queue entry not found'));
      }

      // Doctor must be from the department that owns the queue entry
      if (user.role === 'doctor') {
        const doctor = db
          .prepare('SELECT id, department_id, available FROM doctors WHERE user_id = ?')
          .get(user.id);
        if (!doctor) {
          return next(new HttpError(403, 'FORBIDDEN', 'Doctor profile not found'));
        }
        if (doctor.department_id !== queueEntry.department_id) {
          return next(new HttpError(403, 'FORBIDDEN', 'Doctor not assigned to this department'));
        }
      }

      // Validate state transition
      const validTransitions = {
        WAITING: ['CALLED', 'CANCELLED', 'NO_SHOW'],
        CALLED: ['IN_CONSULTATION', 'NO_SHOW'],
        IN_CONSULTATION: ['COMPLETED'],
        COMPLETED: [],
        CANCELLED: [],
        NO_SHOW: [],
      };

      const normalizedAction = String(action).toUpperCase();

      if (
        !validTransitions[queueEntry.status] ||
        !validTransitions[queueEntry.status].includes(normalizedAction)
      ) {
        return next(
          new HttpError(
            409,
            'CONFLICT',
            `Invalid state transition from ${queueEntry.status} to ${normalizedAction}`
          )
        );
      }

      const now = new Date().toISOString();

      db.prepare(
        'UPDATE queue_entries SET status = ?, started_at = ?, completed_at = ? WHERE id = ?'
      ).run(
        normalizedAction,
        normalizedAction === 'IN_CONSULTATION' ? now : null,
        normalizedAction === 'COMPLETED' ? now : null,
        queueEntryId
      );

      return success(res, {
        queueEntryId,
        fromStatus: queueEntry.status,
        toStatus: normalizedAction,
        message: `State transitioned from ${queueEntry.status} to ${normalizedAction}`,
      });
    } catch (err) {
      return next(new HttpError(500, 'INTERNAL_ERROR', err.message));
    }
  }

  return {
    createToken,
    getToken,
    getQueue,
    callNext,
    cancelToken,
    doctorStateAction,
  };
}
