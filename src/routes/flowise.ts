import { Router } from 'express';
import { z } from 'zod';
import { createIssueFromFlowise } from '../controllers/issuesController.js';
import { createSummaryReportFromFlowise } from '../controllers/summaryReportsController.js';
import { Item } from '../models/Item.js';

export const flowise = Router();

/**
 * Webhook example: store Flowise event payloads.
 * POST /flowise/webhook
 */
const webhookSchema = z.object({
  type: z.string(),
  runId: z.string().optional(),
  payload: z.any(),
});

flowise.post('/flowise/webhook', async (req, res, next) => {
  try {
    const evt = webhookSchema.parse(req.body);
    const doc = await Item.create({
      title: `flowise:${evt.type}`,
      data: { runId: evt.runId, payload: evt.payload },
    });
    res.status(202).json({ received: true, id: doc._id });
  } catch (err) {
    next(err);
  }
});

// Flowise Issue webhook
flowise.post('/flowise/issue-report', createIssueFromFlowise);

// Flowise Summary Report webhook
flowise.post('/flowise/summary-report', createSummaryReportFromFlowise);

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
    const { sendEmail } = await import('../services/mailer.js');
    const result = await sendEmail(to, subject, html);
    res.status(200).json({ ok: true, result });
  } catch (err) {
    next(err);
  }
});

