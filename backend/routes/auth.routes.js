import { Router } from 'express';

/**
 * Assembles the /api/v1/auth router.
 *
 * @param {object} deps
 * @param {object} deps.authController - Controller with register/login/me.
 * @param {import('express').RequestHandler} deps.requireAuth - JWT middleware.
 */
export function authRouter({ authController, requireAuth }) {
  const router = Router();

  router.post('/register', authController.register);
  router.post('/login', authController.login);
  router.get('/me', requireAuth, authController.me);

  return router;
}
