import { registerSchema, loginSchema } from '../schemas/auth.schema.js';
import { success } from '../utils/respond.js';

/**
 * Creates the authentication controller.
 *
 * @param {object} deps
 * @param {ReturnType<import('../services/auth.service.js').createAuthService>} deps.auth
 */
export function createAuthController({ auth }) {
  return {
    /**
     * POST /api/v1/auth/register
     */
    async register(req, res, next) {
      try {
        const input = registerSchema.parse(req.body);
        const result = await auth.register(input);
        return success(res, result, 201);
      } catch (err) {
        return next(err);
      }
    },

    /**
     * POST /api/v1/auth/login
     */
    async login(req, res, next) {
      try {
        const input = loginSchema.parse(req.body);
        const result = await auth.login(input);
        return success(res, result);
      } catch (err) {
        return next(err);
      }
    },

    /**
     * GET /api/v1/auth/me
     */
    me(req, res, next) {
      try {
        return success(res, auth.getCurrentUser(req.user.id));
      } catch (err) {
        return next(err);
      }
    },
  };
}
