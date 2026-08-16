/**
 * Triage assessment repository.
 * Handles persistence of triage assessments to the SQLite database.
 *
 * This layer is thin and focused: only stores/reads assessment records.
 * All scoring logic is handled by the pure triage engine service.
 */
export class TriageRepository {
  /**
   * Creates a new triage assessment record.
   *
   * @param {import('better-sqlite3').Database} db - Open SQLite connection
   * @param {object} assessment - Assessment data
   * @param {number} assessment.patientId - Patient ID from authenticated user
   * @param {string[]} assessment.symptomCodes - Array of symptom codes
   * @param {string} [assessment.description] - Free-text description
   * @param {string} [assessment.severity] - Severity level
   * @param {number} [assessment.priority] - Priority number
   * @param {number} [assessment.score] - Numeric score
   * @param {object} [assessment.scoreBreakdown] - Breakdown object (JSON)
   * @param {boolean} [assessment.isEmergency] - Emergency flag
   * @returns {object} - Created assessment { id, patientId, ... }
   */
  createAssessment(
    db,
    { patientId, symptomCodes, description, severity, priority, score, scoreBreakdown, isEmergency }
  ) {
    const createdAt = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO triage_assessments
        (patient_id, symptom_codes, description, severity, priority, score, score_breakdown, is_emergency, created_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      patientId,
      JSON.stringify(symptomCodes),
      description,
      severity,
      priority,
      score,
      JSON.stringify(scoreBreakdown),
      isEmergency ? 1 : 0,
      createdAt
    );

    return {
      id: Number(info.lastInsertRowid),
      patientId,
      symptomCodes,
      description,
      severity,
      priority,
      score,
      scoreBreakdown,
      isEmergency,
      createdAt,
    };
  }

  /**
   * Gets all assessments for a specific patient.
   *
   * @param {import('better-sqlite3').Database} db - Open SQLite connection
   * @param {number} patientId - Patient ID
   * @returns {object[]} - List of assessment records
   */
  getAssessmentsByPatient(db, patientId) {
    const rows = db
      .prepare(
        `
      SELECT id, patient_id, symptom_codes, description, severity, priority, score, score_breakdown, is_emergency, created_at
      FROM triage_assessments
      WHERE patient_id = ?
      ORDER BY created_at DESC
    `
      )
      .all(patientId);

    return rows.map((row) => ({
      id: row.id,
      patient_id: row.patient_id,
      symptom_codes: JSON.parse(row.symptom_codes),
      description: row.description,
      severity: row.severity,
      priority: row.priority,
      score: row.score,
      score_breakdown: JSON.parse(row.score_breakdown),
      is_emergency: row.is_emergency !== 0,
      created_at: row.created_at,
    }));
  }

  /**
   * Gets the total count of assessments for a patient.
   *
   * @param {import('better-sqlite3').Database} db - Open SQLite connection
   * @param {number} patientId - Patient ID
   * @returns {number} - Count of assessments
   */
  countAssessmentsByPatient(db, patientId) {
    const row = db
      .prepare('SELECT COUNT(*) AS count FROM triage_assessments WHERE patient_id = ?')
      .get(patientId);
    return row.count;
  }
}
