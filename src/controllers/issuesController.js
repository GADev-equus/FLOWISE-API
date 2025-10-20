import { z } from 'zod';
import { env } from '../config/env.js';
import { emailService } from '../services/emailService.js';
import { Issue } from '../models/Issue.js';
import { logger } from '../utils/logger.js';

/**
 * @typedef {Object} SimplifiedIssue
 * @property {string} title
 * @property {string} [description]
 * @property {string} [date]
 * @property {string} [name]
 * @property {string} [email]
 * @property {string} [chatId]
 * @property {string} [sessionId]
 * @property {string} [chatflowId]
 * @property {string} [nodeId]
 */

const flowiseSchema = z.object({
  id: z.string().optional(),
  payload: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    date: z.string().optional(),
    name: z.string().optional(),
    email: z.string().optional(),
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
  name: z.string().optional(),
  email: z.string().optional(),
  chatId: z.string().optional(),
  sessionId: z.string().optional(),
  chatflowId: z.string().optional(),
  nodeId: z.string().optional(),
});

const issueIdSchema = z.object({
  id: z.string().min(1, 'Issue id is required'),
});

/**
 * @typedef {Object} ClientInfo
 * @property {string} ip
 * @property {string} userAgent
 */

/**
 * Extract client metadata from the request headers/socket.
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

/**
 * Normalise Flowise payload into a simplified issue shape.
 * @param {unknown} input
 * @returns {SimplifiedIssue}
 */
function parseFlowiseIssuePayload(input) {
  const parsed = flowiseSchema.parse(input);
  const {
    title = 'Issue',
    description = '',
    date,
    name,
    email,
    chatId,
    sessionId,
    chatflowId,
    nodeId,
  } = parsed.payload;

  return {
    title,
    description,
    date,
    name,
    email,
    chatId,
    sessionId,
    chatflowId,
    nodeId,
  };
}

/**
 * Send an issue alert email if alerting has been configured.
 * @param {SimplifiedIssue & {source: string}} issue
 */
async function maybeSendIssueEmail(issue) {
  if (!env.issueAlertTo) {
    return;
  }

  try {
    const subject = `New Issue: ${issue.title}`;
    const lines = [
      `Source: ${issue.source}`,
      issue.description ? `Description: ${issue.description}` : undefined,
      issue.date ? `Date: ${issue.date}` : undefined,
      issue.name ? `Name: ${issue.name}` : undefined,
      issue.email ? `Email: ${issue.email}` : undefined,
      issue.chatId ? `Chat ID: ${issue.chatId}` : undefined,
      issue.sessionId ? `Session ID: ${issue.sessionId}` : undefined,
      issue.chatflowId ? `Chatflow ID: ${issue.chatflowId}` : undefined,
      issue.nodeId ? `Node ID: ${issue.nodeId}` : undefined,
    ].filter(Boolean);

    if (!lines.length) {
      return;
    }

    const html = `<p>${lines
      .map((line) => line.replace(/\n/g, '<br />'))
      .join('</p><p>')}</p>`;
    const text = lines.join('\n');

    const result = await emailService.send({
      to: env.issueAlertTo,
      subject,
      html,
      text,
    });

    if (!result.success && !result.skipped) {
      logger.warn({ err: result.error }, 'Failed to send issue alert email');
    }
  } catch (error) {
    logger.warn({ err: error }, 'Failed to send issue alert email');
  }
}
/**
 * Prepare Mongo document payload for an issue.
 * @param {SimplifiedIssue} issue
 * @param {string} source
 * @param {ClientInfo} client
 */
function buildIssueDocument(issue, source, client) {
  const baseDocument = {
    source,
    title: issue.title,
    description: issue.description ?? '',
    details: issue.date ?? '',
    client,
  };

  return {
    ...baseDocument,
    ...(issue.name !== undefined ? { name: issue.name } : {}),
    ...(issue.email !== undefined ? { email: issue.email } : {}),
    ...(issue.chatId !== undefined ? { chatId: issue.chatId } : {}),
    ...(issue.sessionId !== undefined ? { sessionId: issue.sessionId } : {}),
    ...(issue.chatflowId !== undefined ? { chatflowId: issue.chatflowId } : {}),
    ...(issue.nodeId !== undefined ? { nodeId: issue.nodeId } : {}),
  };
}
/**
 * Handle Flowise webhook submissions.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function createIssueFromFlowise(req, res, next) {
  try {
    const simplified = parseFlowiseIssuePayload(req.body);
    const client = extractClient(req);
    const doc = await Issue.create(
      buildIssueDocument(simplified, 'flowise', client),
    );
    await maybeSendIssueEmail({ ...simplified, source: 'flowise' });
    res.status(202).json({ received: true, id: doc._id });
  } catch (err) {
    next(err);
  }
}

/**
 * Handle manual issue submissions.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function createIssue(req, res, next) {
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

/**
 * List issues in reverse chronological order.
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function listIssues(_req, res, next) {
  try {
    const list = await Issue.find().sort({ createdAt: -1 }).lean();
    res.json(list);
  } catch (err) {
    next(err);
  }
}

/**
 * Fetch a single issue by id.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function getIssue(req, res, next) {
  try {
    const { id } = issueIdSchema.parse(req.params);
    const doc = await Issue.findById(id).lean();

    if (!doc) {
      res
        .status(404)
        .json({
          status: 404,
          code: 'ISSUE_NOT_FOUND',
          message: 'Issue not found',
        });
      return;
    }

    res.json(doc);
  } catch (err) {
    next(err);
  }
}
