import { Router } from 'express';
import {
  createSummaryReport,
  getSummaryReport,
  listSummaryReports,
} from '../controllers/summaryReportsController.js';

export const summaryReports = Router();

summaryReports.get('/summary-reports', listSummaryReports);
summaryReports.get('/summary-reports/:id', getSummaryReport);
summaryReports.post('/summary-reports', createSummaryReport);