import { Router } from 'express';

/**
 * Development-only endpoints that exercise the role authorization
 * middleware. Mounted ONLY when NODE_ENV !== 'production' — never exposed
 * in production.
 *
 * @param {object} deps
 * @param {import('express').RequestHandler} deps.requireAuth
 * @param {(role: string) => import('express').RequestHandler} deps.requireRole
 */
export function devTestRouter({ requireAuth, requireRole }) {
  const router = Router();

  const ok = (_req, res) => res.json({ data: { allowed: true } });

  router.get('/roles/patient', requireAuth, requireRole('patient'), ok);
  router.get('/roles/doctor', requireAuth, requireRole('doctor'), ok);
  router.get('/roles/staff', requireAuth, requireRole('staff'), ok);
  router.get('/roles/admin', requireAuth, requireRole('admin'), ok);
  router.get('/roles/doctor-staff', requireAuth, requireRole('doctor', 'staff'), ok);

  return router;
}
