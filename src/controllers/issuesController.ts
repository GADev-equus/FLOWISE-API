import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { Issue } from '../models/Issue.js';
import { logger } from '../utils/logger.js';

type SimplifiedIssue = {
  title: string;
  description?: string;
  date?: string;
  chatId?: string;
  sessionId?: string;
  chatflowId?: string;
  nodeId?: string;
};

const flowiseSchema = z.object({
  id: z.string().optional(),
  payload: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    date: z.string().optional(),
    chatId: z.string().optional(),
    sessionId: z.string().optional(),
    chatflowId: z.string().optional(),
    nodeId: z.string().optional(),
  }),
});

const manualSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  date: z.string().optional(),
  chatId: z.string().optional(),
  sessionId: z.string().optional(),
  chatflowId: z.string().optional(),
  nodeId: z.string().optional(),
});

const issueIdSchema = z.object({
  id: z.string().min(1, 'Issue id is required'),
});

type ClientInfo = {
  ip: string;
  userAgent: string;
};

function extractClient(req: Request): ClientInfo {
  const forwarded = req.headers['x-forwarded-for'] as string | undefined;
  const ip = forwarded?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
  const userAgent = (req.headers['user-agent'] as string | undefined) ?? '';
  return { ip, userAgent };
}

function parseFlowiseIssuePayload(input: unknown): SimplifiedIssue {
  const parsed = flowiseSchema.parse(input);
  const {
    title = 'Issue',
    description = '',
    date,
    chatId,
    sessionId,
    chatflowId,
    nodeId,
  } = parsed.payload;

  return {
    title,
    description,
    date,
    chatId,
    sessionId,
    chatflowId,
    nodeId,
  };
}

async function maybeSendIssueEmail(issue: SimplifiedIssue & { source: string }): Promise<void> {
  if (!env.issueAlertTo) {
    return;
  }

  try {
    const { sendEmail } = await import('../services/mailer.js');
    const subject = `New Issue: ${issue.title}`;
    const lines = [
      `Source: ${issue.source}`,
      issue.description ? `Description: ${issue.description}` : undefined,
      issue.date ? `Date: ${issue.date}` : undefined,
    ].filter(Boolean) as string[];

    const html = `<p>${lines.join('</p><p>')}</p>`;
    await sendEmail(env.issueAlertTo, subject, html);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to send issue alert email');
  }
}

function buildIssueDocument(issue: SimplifiedIssue, source: string, client: ClientInfo) {
  const baseDocument = {
    source,
    title: issue.title,
    description: issue.description ?? '',
    details: issue.date ?? '',
    client,
  };

  return {
    ...baseDocument,
    ...(issue.chatId !== undefined ? { chatId: issue.chatId } : {}),
    ...(issue.sessionId !== undefined ? { sessionId: issue.sessionId } : {}),
    ...(issue.chatflowId !== undefined ? { chatflowId: issue.chatflowId } : {}),
    ...(issue.nodeId !== undefined ? { nodeId: issue.nodeId } : {}),
  };
}

export async function createIssueFromFlowise(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const simplified = parseFlowiseIssuePayload(req.body);
    const client = extractClient(req);
    const doc = await Issue.create(buildIssueDocument(simplified, 'flowise', client));
    await maybeSendIssueEmail({ ...simplified, source: 'flowise' });
    res.status(202).json({ received: true, id: doc._id });
  } catch (err) {
    next(err);
  }
}

export async function createIssue(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = manualSchema.parse(req.body);
    const client = extractClient(req);
    const doc = await Issue.create(buildIssueDocument(body, 'manual', client));
    await maybeSendIssueEmail({ ...body, source: 'manual' });
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
}

export async function listIssues(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const list = await Issue.find().sort({ createdAt: -1 }).lean();
    res.json(list);
  } catch (err) {
    next(err);
  }
}

export async function getIssue(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = issueIdSchema.parse(req.params);
    const doc = await Issue.findById(id).lean();

    if (!doc) {
      res.status(404).json({ status: 404, code: 'ISSUE_NOT_FOUND', message: 'Issue not found' });
      return;
    }

    res.json(doc);
  } catch (err) {
    next(err);
  }
}
