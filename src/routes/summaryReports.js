import { Router } from 'express';
import {
  createSummaryReport,
  getSummaryReport,
  listSummaryReports,
  getGuardianReports,
} from '../controllers/summaryReportsController.js';

export const summaryReports = Router();

summaryReports.get('/summary-reports', listSummaryReports);
summaryReports.get('/summary-reports/guardian/reports', getGuardianReports);
summaryReports.get('/summary-reports/:id', getSummaryReport);
summaryReports.post('/summary-reports', createSummaryReport);
