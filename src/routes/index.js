import { Router } from 'express';
import { flowise } from './flowise.js';
import { health } from './health.js';
import { issues } from './issues.js';
import { summaryReports } from './summaryReports.js';
import { students } from './students.js';

export function buildRoutes(prefix = '/api/v1') {
  const scoped = Router();
  scoped.use(health);
  scoped.use(flowise);
  scoped.use(issues);
  scoped.use(summaryReports);
  scoped.use(students);

  const root = Router();
  root.use(prefix, scoped);

  return root;
}



