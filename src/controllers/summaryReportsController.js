import { z } from 'zod';
import { env } from '../config/env.js';
import { emailService } from '../services/emailService.js';
import { SummaryReport } from '../models/SummaryReport.js';
import { logger } from '../utils/logger.js';

const baseReportSchema = z.object({
  title: z.string().min(1),
  date: z.string().min(1),
  participants: z.string().min(1),
  scopeCovered: z.string().min(1),
  keyLearnings: z.string().min(1),
  misconceptionsClarified: z.string().optional(),
  studentStrengths: z.string().optional(),
  gapsNextPriorities: z.string().optional(),
  suggestedNextSteps: z.string().optional(),
  questions: z.string().optional(),
  sources: z.string().optional(),
  compactRecap: z.string().optional(),
  name: z.string().optional(),
  email: z.string().optional(),
});

const metadataSchema = z.object({
  chatId: z.string().optional(),
  sessionId: z.string().optional(),
  chatflowId: z.string().optional(),
});

const manualSchema = baseReportSchema.merge(metadataSchema);

const flowiseSchema = z.object({
  id: z.string().optional(),
  payload: baseReportSchema.merge(metadataSchema),
});

const idSchema = z.object({
  id: z.string().min(1, 'Summary report id is required'),
});

/**
 * @typedef {Object} SummaryReportPayload
 * @property {string} title
 * @property {string} date
 * @property {string} participants
 * @property {string} scopeCovered
 * @property {string} keyLearnings
 * @property {string} [misconceptionsClarified]
 * @property {string} [studentStrengths]
 * @property {string} [gapsNextPriorities]
 * @property {string} [suggestedNextSteps]
 * @property {string} [questions]
 * @property {string} [sources]
 * @property {string} [compactRecap]
 * @property {string} [name]
 * @property {string} [email]
 * @property {string} [chatId]
 * @property {string} [sessionId]
 * @property {string} [chatflowId]
 */

/**
 * @typedef {SummaryReportPayload & {source: string, sourceId?: string}} SummaryReportEmailPayload
 */

/**
 * @typedef {Object} ClientInfo
 * @property {string} ip
 * @property {string} userAgent
 */

/**
 * Extract common client metadata from the request.
 * @param {import('express').Request} req
 * @returns {ClientInfo}
 */
function extractClient(req) {
  const forwardedHeader = req.headers['x-forwarded-for'];
  const forwardedValue = Array.isArray(forwardedHeader)
    ? forwardedHeader[0]
    : forwardedHeader;
  const forwarded =
    typeof forwardedValue === 'string' ? forwardedValue : undefined;
  const ip =
    forwarded?.split(',')[0]?.trim() || req.socket?.remoteAddress || '';
  const userAgentHeader = req.headers['user-agent'];
  const userAgent = Array.isArray(userAgentHeader)
    ? userAgentHeader.join(', ')
    : userAgentHeader ?? '';
  return { ip, userAgent };
}

function escapeHtml(input) {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Format a report field for HTML output.
 * @param {string} label
 * @param {string | undefined} value
 * @returns {string | undefined}
 */
function formatField(label, value) {
  if (!value) {
    return undefined;
  }

  const escaped = escapeHtml(value).replace(/\n/g, '<br />');
  return `<p><strong>${label}:</strong><br />${escaped}</p>`;
}

/**
 * Format a report field for plain-text output.
 * @param {string} label
 * @param {string | undefined} value
 * @returns {string | undefined}
 */
function formatFieldText(label, value) {
  if (!value) {
    return undefined;
  }

  return `${label}:
${value}`;
}

/**
 * Send a summary report email when configured.
 * @param {SummaryReportEmailPayload} report
 */
async function maybeSendReportEmail(report) {
  if (!env.summaryReportAlertTo) {
    return;
  }

  try {
    const subject = `Summary Report: ${report.title}`;
    const sections = [
      {
        label: 'Source',
        value: report.sourceId
          ? `${report.source} (${report.sourceId})`
          : report.source,
      },
      { label: 'Date', value: report.date },
      { label: 'Participants', value: report.participants },
      { label: 'Scope Covered', value: report.scopeCovered },
      { label: 'Key Learnings', value: report.keyLearnings },
      {
        label: 'Misconceptions Clarified',
        value: report.misconceptionsClarified,
      },
      { label: 'Student Strengths', value: report.studentStrengths },
      { label: 'Gaps / Next Priorities', value: report.gapsNextPriorities },
      { label: 'Suggested Next Steps', value: report.suggestedNextSteps },
      { label: 'Questions', value: report.questions },
      { label: 'Sources', value: report.sources },
      { label: 'Compact Recap', value: report.compactRecap },
      { label: 'Name', value: report.name },
      { label: 'Email', value: report.email },
      { label: 'Chat ID', value: report.chatId },
      { label: 'Session ID', value: report.sessionId },
      { label: 'Chatflow ID', value: report.chatflowId },
    ];

    const htmlSections = sections
      .map((section) => formatField(section.label, section.value))
      .filter(Boolean);

    if (!htmlSections.length) {
      return;
    }

    const textSections = sections
      .map((section) => formatFieldText(section.label, section.value))
      .filter(Boolean);

    const result = await emailService.send({
      to: env.summaryReportAlertTo,
      subject,
      html: htmlSections.join(''),
      text: textSections.join('\n\n'),
    });

    if (!result.success && !result.skipped) {
      logger.warn(
        { err: result.error },
        'Failed to send summary report alert email',
      );
    }
  } catch (error) {
    logger.warn({ err: error }, 'Failed to send summary report alert email');
  }
}

/**
 * Persist a Flowise-generated summary report.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function createSummaryReportFromFlowise(req, res, next) {
  try {
    const { id, payload } = flowiseSchema.parse(req.body);
    const client = extractClient(req);

    const doc = await SummaryReport.create({
      source: 'flowise',
      sourceId: id ?? '',
      ...payload,
      client,
    });

    await maybeSendReportEmail({ ...payload, source: 'flowise', sourceId: id });
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
}

/**
 * Persist a manually submitted summary report.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function createSummaryReport(req, res, next) {
  try {
    const body = manualSchema.parse(req.body);
    const client = extractClient(req);

    const doc = await SummaryReport.create({
      source: 'manual',
      ...body,
      client,
    });

    await maybeSendReportEmail({ ...body, source: 'manual' });
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
}

/**
 * List the most recent summary reports.
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function listSummaryReports(_req, res, next) {
  try {
    const items = await SummaryReport.find()
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    res.json(items);
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieve a summary report by identifier.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function getSummaryReport(req, res, next) {
  try {
    const { id } = idSchema.parse(req.params);
    const doc = await SummaryReport.findById(id).lean();

    if (!doc) {
      res.status(404).json({ error: 'Summary report not found' });
      return;
    }

    res.json(doc);
  } catch (err) {
    next(err);
  }
}
