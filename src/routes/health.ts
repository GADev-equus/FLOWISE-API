import { Router } from 'express';

export const health = Router();

health.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

health.get('/config', (_req, res) => {
  res.json({
    env: process.env.NODE_ENV,
    version: 'v1',
    basePath: process.env.API_PREFIX ?? '/api/v1',
  });
});
