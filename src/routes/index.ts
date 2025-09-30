import { Router } from 'express';
import { flowise } from './flowise.js';
import { health } from './health.js';
import { issues } from './issues.js';
import { items } from './items.js';

export function buildRoutes(prefix = '/api/v1'): Router {
  const scoped = Router();
  scoped.use(health);
  scoped.use(items);
  scoped.use(flowise);
  scoped.use(issues);

  const root = Router();
  root.use(prefix, scoped);

  return root;
}
