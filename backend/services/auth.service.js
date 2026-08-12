import jwt from 'jsonwebtoken';
import { HttpError } from '../utils/http-error.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { normalizePhone } from '../utils/phone.js';
import {
  checkLoginAttempt,
  recordLoginFailure,
  clearLoginFailures,
} from '../utils/login-limiter.js';

/**
 * Audit helper. Records an authentication event in audit_logs.
 * Passwords and JWTs are never stored here; meta is minimal and safe.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {object} entry
 * @param {number|null} entry.actorUserId
 * @param {string} entry.action - e.g. AUTH_REGISTER, AUTH_LOGIN_SUCCESS, AUTH_LOGIN_FAILURE
 * @param {string} entry.entityType
 * @param {number|null} entry.entityId
 * @param {object|null} [entry.meta]
 */
export function recordAudit(db, { actorUserId, action, entityType, entityId, meta = null }) {
  db.prepare(
    `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, meta)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    actorUserId ?? null,
    action,
    entityType,
    entityId === null || entityId === undefined ? null : String(entityId),
    meta === null || meta === undefined ? null : JSON.stringify(meta)
  );
}

/**
 * Builds the safe, client-facing user object. password_hash is never exposed.
 *
 * @param {object} user - users row.
 */
function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    role: user.role,
  };
}

/**
 * Sign a minimal JWT. Only `sub` (user id) and `role` are carried.
 * No passwords, symptoms, ABHA, tokens, or queue data.
 *
 * @param {object} user - users row (must have id and role).
 * @param {object} config - must include jwtSecret and jwtExpiresIn.
 */
export function signToken(user, { jwtSecret, jwtExpiresIn }) {
  return jwt.sign({ role: user.role }, jwtSecret, {
    subject: String(user.id),
    expiresIn: jwtExpiresIn,
  });
}

/**
 * Dummy bcrypt hash used to equalize response timing when the phone number
 * does not exist, so callers cannot reliably tell "unknown phone" from
 * "wrong password".
 */
let dummyHashPromise;
function getDummyHash() {
  if (!dummyHashPromise) dummyHashPromise = hashPassword('timing-equalizer-not-a-real-password');
  return dummyHashPromise;
}

/**
 * Creates the authentication service bound to a database and config.
 *
 * @param {object} deps
 * @param {import('better-sqlite3').Database} deps.db
 * @param {object} deps.config - must include jwtSecret and jwtExpiresIn.
 */
export function createAuthService({ db, config }) {
  return {
    /**
     * Registers a new patient account.
     * Creates users + patients inside ONE database transaction.
     * Roles are never client-selectable; new accounts are always `patient`.
     */
    async register({ name, phone, password }) {
      const normalized = normalizePhone(phone);
      if (!normalized) {
        throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid phone number');
      }

      const existing = db.prepare('SELECT id FROM users WHERE phone = ?').get(normalized);
      if (existing) {
        throw new HttpError(409, 'USER_EXISTS', 'A user with this phone number already exists');
      }

      const passwordHash = await hashPassword(password);

      const insertUser = db.prepare(
        `INSERT INTO users (phone, password_hash, role, name) VALUES (?, ?, 'patient', ?)`
      );
      const insertPatient = db.prepare(
        'INSERT INTO patients (user_id, name, phone) VALUES (?, ?, ?)'
      );
      const insertAudit = db.prepare(
        `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, meta)
         VALUES (?, ?, ?, ?, ?)`
      );

      const createAccount = db.transaction(() => {
        const { lastInsertRowid: userId } = insertUser.run(normalized, passwordHash, name);
        insertPatient.run(userId, name, normalized);
        insertAudit.run(
          userId,
          'AUTH_REGISTER',
          'user',
          userId,
          JSON.stringify({ role: 'patient' })
        );
        return userId;
      });

      const userId = createAccount();
      const user = db.prepare('SELECT id, phone, role, name FROM users WHERE id = ?').get(userId);
      return { user: publicUser(user), token: signToken(user, config) };
    },

    /**
     * Logs a user in. Uses a generic INVALID_CREDENTIALS error so the
     * response never reveals whether a phone exists.
     */
    async login({ phone, password }) {
      const normalized = normalizePhone(phone);
      if (!normalized) {
        throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid phone number');
      }

      checkLoginAttempt(normalized);

      const user = db
        .prepare('SELECT id, phone, password_hash, role, name FROM users WHERE phone = ?')
        .get(normalized);

      if (!user) {
        await verifyPassword(password, await getDummyHash());
        recordLoginFailure(normalized);
        recordAudit(db, {
          actorUserId: null,
          action: 'AUTH_LOGIN_FAILURE',
          entityType: 'user',
          entityId: null,
          meta: { reason: 'invalid_credentials' },
        });
        throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid credentials');
      }

      const valid = await verifyPassword(password, user.password_hash);
      if (!valid) {
        recordLoginFailure(normalized);
        recordAudit(db, {
          actorUserId: user.id,
          action: 'AUTH_LOGIN_FAILURE',
          entityType: 'user',
          entityId: user.id,
          meta: { reason: 'invalid_credentials' },
        });
        throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid credentials');
      }

      clearLoginFailures(normalized);
      recordAudit(db, {
        actorUserId: user.id,
        action: 'AUTH_LOGIN_SUCCESS',
        entityType: 'user',
        entityId: user.id,
      });

      return { user: publicUser(user), token: signToken(user, config) };
    },

    /**
     * Returns the current authenticated user. For patients the patient
     * profile is included. Never returns password_hash.
     */
    getCurrentUser(userId) {
      const user = db.prepare('SELECT id, phone, role, name FROM users WHERE id = ?').get(userId);
      if (!user) {
        throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required');
      }

      const payload = { user: publicUser(user) };

      if (user.role === 'patient') {
        const patient = db
          .prepare('SELECT id, name, age, gender, phone, abha_id FROM patients WHERE user_id = ?')
          .get(userId);
        payload.patient = patient ?? null;
      }

      return payload;
    },
  };
}
