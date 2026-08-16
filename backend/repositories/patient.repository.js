/**
 * Patient repository.
 *
 * Thin persistence layer for the patients table. All lookups are scoped by
 * the owning user (`user_id`); the authenticated user is always the source
 * of truth for ownership, never a client-supplied id.
 */
export class PatientRepository {
  /**
   * Finds a patient profile by the owning user id.
   *
   * @param {import('better-sqlite3').Database} db
   * @param {number} userId - The authenticated user's id.
   * @returns {object | undefined} patients row (snake_case) or undefined.
   */
  findByUserId(db, userId) {
    return db.prepare('SELECT * FROM patients WHERE user_id = ?').get(userId);
  }

  /**
   * Finds a patient profile by primary key.
   *
   * @param {import('better-sqlite3').Database} db
   * @param {number} id - Patient row id.
   * @returns {object | undefined} patients row (snake_case) or undefined.
   */
  findById(db, id) {
    return db.prepare('SELECT * FROM patients WHERE id = ?').get(id);
  }

  /**
   * Creates a patient profile. All values are bound parameters.
   *
   * @param {import('better-sqlite3').Database} db
   * @param {object} patient
   * @param {number} patient.userId
   * @param {string} patient.name
   * @param {number|null} patient.age
   * @param {string|null} patient.gender
   * @param {string} patient.phone - Normalized phone (NOT NULL column).
   * @returns {object} The created patients row.
   */
  create(db, { userId, name, age, gender, phone }) {
    const info = db
      .prepare(
        `INSERT INTO patients (user_id, name, age, gender, phone, updated_at)
         VALUES (@userId, @name, @age, @gender, @phone, datetime('now'))`
      )
      .run({ userId, name, age, gender, phone });

    return this.findById(db, Number(info.lastInsertRowid));
  }

  /**
   * Partially updates a patient profile.
   *
   * Only keys present in `fields` are written; the column set comes from a
   * fixed allowlist (never from user input), so the SQL is safe. Always
   * bumps `updated_at`.
   *
   * @param {import('better-sqlite3').Database} db
   * @param {number} id - Patient row id.
   * @param {object} fields - Partial { name, age, gender, phone }.
   * @returns {object} The updated patients row.
   */
  update(db, id, fields) {
    const columnMap = { name: 'name', age: 'age', gender: 'gender', phone: 'phone' };
    const columns = Object.keys(columnMap)
      .filter((key) => fields[key] !== undefined)
      .map((key) => columnMap[key]);

    if (columns.length === 0) {
      return this.findById(db, id);
    }

    const setClause = columns.map((column) => `${column} = @${column}`).join(', ');
    db.prepare(`UPDATE patients SET ${setClause}, updated_at = datetime('now') WHERE id = @id`).run(
      { ...fields, id }
    );

    return this.findById(db, id);
  }

  /**
   * Returns the most recent triage assessments for a patient, newest first.
   *
   * @param {import('better-sqlite3').Database} db
   * @param {number} patientId - Patient row id.
   * @param {number} limit - Maximum number of rows.
   * @returns {Array<object>} triage_assessments rows (snake_case).
   */
  findRecentTriageByPatientId(db, patientId, limit) {
    return db
      .prepare(
        `SELECT id, severity, priority, score, is_emergency, created_at
         FROM triage_assessments
         WHERE patient_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT ?`
      )
      .all(patientId, limit);
  }
}
