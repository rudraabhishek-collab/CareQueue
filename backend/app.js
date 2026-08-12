import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { apiRouter } from './routes/index.js';
import { requestLogger } from './middleware/request-logger.js';
import { notFoundHandler, errorHandler } from './middleware/error-handler.js';

/**
 * Builds the Express application.
 *
 * @param {object} deps
 * @param {object} deps.config - Application config.
 * @param {import('better-sqlite3').Database} deps.db - Open SQLite connection.
 * @param {import('pino').Logger} deps.logger - Pino logger instance.
 * @returns {import('express').Express} The configured app.
 */
export function createApp({ config, db, logger }) {
  const app = express();
  app.disable('x-powered-by');

  app.locals.db = db;

  app.use(requestLogger(logger));
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/v1', apiRouter({ config, db }));
  app.use('/api', notFoundHandler);

  app.use(express.static(config.frontendDir, { index: false }));
  app.get('/', (_req, res) => {
    res.sendFile(path.join(config.frontendDir, 'careQueue.html'));
  });

  app.use(notFoundHandler);
  app.use(errorHandler({ logger }));

  return app;
}
