import { Router } from 'express';
import { z } from 'zod';
import { createIssueFromFlowise } from '../controllers/issuesController.js';
import { createStudentFromFlowise } from '../controllers/studentsController.js';
import { createSummaryReportFromFlowise } from '../controllers/summaryReportsController.js';
import { emailService } from '../services/emailService.js';

export const flowise = Router();

// Flowise Issue webhook
flowise.post('/flowise/issue-report', createIssueFromFlowise);

// Flowise Summary Report webhook
flowise.post('/flowise/summary-report', createSummaryReportFromFlowise);

// Flowise Student webhook
flowise.post('/flowise/student', createStudentFromFlowise);

/**
 * Tool example: send an email triggered by Flowise (or any client).
 * POST /tools/send-email
 */
const mailSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  html: z.string().min(1),
});

flowise.post('/tools/send-email', async (req, res, next) => {
  try {
    const { to, subject, html } = mailSchema.parse(req.body);
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const result = await emailService.send({ to, subject, html, text });
    res.status(200).json({ ok: true, result });
  } catch (err) {
    next(err);
  }
});



