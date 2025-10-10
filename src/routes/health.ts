import { Router } from 'express';
import { emailService } from '../services/emailService.js';

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

health.get('/email-status', (_req, res) => {
  res.json(emailService.getStatus());
});
