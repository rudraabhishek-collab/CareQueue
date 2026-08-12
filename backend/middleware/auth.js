import jwt from 'jsonwebtoken';
import { HttpError } from '../utils/http-error.js';

/**
 * Creates authentication/authorization middleware bound to a database and
 * JWT secret.
 *
 * @param {object} deps
 * @param {import('better-sqlite3').Database} deps.db
 * @param {string} deps.jwtSecret - Secret used to verify Bearer tokens.
 */
export function createAuthMiddleware({ db, jwtSecret }) {
  /**
   * Verifies the Bearer token, then loads the user from the database.
   *
   * Required claims: `sub` (user id) and `role`. The role used for
   * authorization always comes from the database row (source of truth),
   * not from the token claims.
   *
   * Missing/invalid/expired tokens and deleted users all produce the same
   * generic 401 — no verification internals are exposed.
   *
   * @type {import('express').RequestHandler}
   */
  function requireAuth(req, _res, next) {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return next(new HttpError(401, 'UNAUTHORIZED', 'Authentication required'));
    }

    let payload;
    try {
      payload = jwt.verify(token, jwtSecret);
    } catch {
      return next(new HttpError(401, 'UNAUTHORIZED', 'Authentication required'));
    }

    const { sub, role } = payload;
    if (sub === undefined || sub === null || role === undefined || role === null) {
      return next(new HttpError(401, 'UNAUTHORIZED', 'Authentication required'));
    }

    const user = db.prepare('SELECT id, phone, role, name FROM users WHERE id = ?').get(sub);
    if (!user) {
      return next(new HttpError(401, 'UNAUTHORIZED', 'Authentication required'));
    }

    req.user = {
      id: user.id,
      phone: user.phone,
      role: user.role,
      name: user.name,
    };
    req.auth = payload;

    return next();
  }

  /**
   * Restricts an authenticated route to one or more roles.
   * Must be used after requireAuth.
   *
   * @param {...string} roles - Allowed roles, e.g. requireRole('doctor', 'staff').
   * @returns {import('express').RequestHandler}
   */
  function requireRole(...roles) {
    return (req, _res, next) => {
      if (!req.user) {
        return next(new HttpError(401, 'UNAUTHORIZED', 'Authentication required'));
      }
      if (!roles.includes(req.user.role)) {
        return next(new HttpError(403, 'FORBIDDEN', `Requires role: ${roles.join(' or ')}`));
      }
      return next();
    };
  }

  return { requireAuth, requireRole };
}
