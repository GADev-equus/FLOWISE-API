import { Router } from 'express';
import { createIssue, getIssue, listIssues } from '../controllers/issuesController.js';

export const issues = Router();

issues.get('/issues/:id', getIssue);
issues.get('/issues', listIssues);
issues.post('/issues', createIssue);
