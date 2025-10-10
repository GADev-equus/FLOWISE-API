import { NextFunction, Request, Response } from 'express';
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

type ClientInfo = {
  ip: string;
  userAgent: string;
};

type SummaryReportEmailPayload = z.infer<typeof manualSchema> & {
  source: string;
  sourceId?: string;
};

function extractClient(req: Request): ClientInfo {
  const forwarded = req.headers['x-forwarded-for'] as string | undefined;
  const ip = forwarded?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
  const userAgent = (req.headers['user-agent'] as string | undefined) ?? '';
  return { ip, userAgent };
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatField(
  label: string,
  value: string | undefined,
): string | undefined {
  if (!value) {
    return undefined;
  }

  const escaped = escapeHtml(value).replace(/\n/g, '<br />');
  return `<p><strong>${label}:</strong><br />${escaped}</p>`;
}

function formatFieldText(label: string, value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return `${label}:
${value}`;
}
async function maybeSendReportEmail(
  report: SummaryReportEmailPayload,
): Promise<void> {
  if (!env.summaryReportAlertTo) {
    return;
  }

  try {
    const subject = `Summary Report: ${report.title}`;
    const sections = [
      { label: 'Source', value: report.sourceId ? `${report.source} (${report.sourceId})` : report.source },
      { label: 'Date', value: report.date },
      { label: 'Participants', value: report.participants },
      { label: 'Scope Covered', value: report.scopeCovered },
      { label: 'Key Learnings', value: report.keyLearnings },
      { label: 'Misconceptions Clarified', value: report.misconceptionsClarified },
      { label: 'Student Strengths', value: report.studentStrengths },
      { label: 'Gaps / Next Priorities', value: report.gapsNextPriorities },
      { label: 'Suggested Next Steps', value: report.suggestedNextSteps },
      { label: 'Questions', value: report.questions },
      { label: 'Sources', value: report.sources },
      { label: 'Compact Recap', value: report.compactRecap },
      { label: 'Chat ID', value: report.chatId },
      { label: 'Session ID', value: report.sessionId },
      { label: 'Chatflow ID', value: report.chatflowId },
    ];

    const htmlSections = sections
      .map((section) => formatField(section.label, section.value))
      .filter(Boolean) as string[];

    if (!htmlSections.length) {
      return;
    }

    const textSections = sections
      .map((section) => formatFieldText(section.label, section.value))
      .filter(Boolean) as string[];

    const result = await emailService.send({
      to: env.summaryReportAlertTo,
      subject,
      html: htmlSections.join(''),
      text: textSections.join('\n\n'),
    });

    if (!result.success && !result.skipped) {
      logger.warn({ err: result.error }, 'Failed to send summary report alert email');
    }
  } catch (error) {
    logger.warn({ err: error }, 'Failed to send summary report alert email');
  }
}
export async function createSummaryReportFromFlowise(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
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

export async function createSummaryReport(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
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

export async function listSummaryReports(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
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

export async function getSummaryReport(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
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






