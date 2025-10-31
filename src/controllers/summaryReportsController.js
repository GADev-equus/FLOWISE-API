import { z } from 'zod';
import { env } from '../config/env.js';
import { emailService } from '../services/emailService.js';
import { SummaryReport } from '../models/SummaryReport.js';
import { Student } from '../models/Student.js';
import { logger } from '../utils/logger.js';

// Updated schema for new structure
const identitySchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

const contextSchema = z.object({
  chatId: z.string().optional(),
  sessionId: z.string().optional(),
  chatflowId: z.string().optional(),
  source: z.string().optional(),
  sourceId: z.string().optional(),
});

const sectionSchema = z.object({
  board: z.string().min(1),
  code: z.string().min(1),
  label: z.string().optional(),
});

const sourceSchema = z.object({
  type: z.string().min(1),
  board: z.string().optional(),
  ref: z.string().min(1),
});

const baseReportSchema = z.object({
  studentId: z.string().min(1),
  title: z.string().min(1),
  identity: identitySchema,
  context: contextSchema.optional(),
  participants: z.array(z.string()).min(1),
  sections: z.array(sectionSchema).optional(),
  topics: z.array(z.string()).optional(),
  scopeCovered: z.array(z.string()).min(1),
  keyLearnings: z.array(z.string()).optional(),
  misconceptionsClarified: z.array(z.string()).optional(),
  studentStrengths: z.array(z.string()).optional(),
  gapsNextPriorities: z.array(z.string()).optional(),
  suggestedNextSteps: z.array(z.string()).optional(),
  questions: z.array(z.string()).optional(),
  sources: z.array(sourceSchema).optional(),
  compactRecap: z.array(z.string()).optional(),
});

const flowiseSchema = z.object({
  id: z.string().optional(),
  payload: baseReportSchema,
});

const idSchema = z.object({
  id: z.string().min(1, 'Summary report id is required'),
});

/**
 * @typedef {Object} ClientInfo
 * @property {string} ip
 * @property {string} userAgent
 */

/**
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

/**
 * Extract custom headers and merge with body data.
 * @param {import('express').Request} req
 * @returns {Record<string, any>}
 */
function extractHeaderData(req) {
  const headers = req.headers;
  const headerData = {};

  // Extract custom fields from headers
  if (headers.name || headers.email) {
    headerData.identity = {};
    if (headers.name) headerData.identity.name = headers.name;
    if (headers.email) headerData.identity.email = headers.email;
  }

  if (headers.studentid) headerData.studentId = headers.studentid;

  // Context data
  const contextFields = {};
  if (headers['x-flow-chat-id'])
    contextFields.chatId = headers['x-flow-chat-id'];
  if (headers['x-flow-session-id'])
    contextFields.sessionId = headers['x-flow-session-id'];
  if (headers['x-flow-chatflow-id'])
    contextFields.chatflowId = headers['x-flow-chatflow-id'];

  if (Object.keys(contextFields).length > 0) {
    headerData.context = contextFields;
  }

  return headerData;
}

/**
 * Transform old flat schema to new nested schema for backward compatibility.
 * @param {Record<string, any>} data
 * @returns {Record<string, any>}
 */
function transformLegacyFormat(data) {
  // Check if data is already in new format
  if (data.identity && typeof data.identity === 'object') {
    return data; // Already new format
  }

  const transformed = { ...data };

  // Transform identity fields
  if (data.name || data.email) {
    transformed.identity = {
      name: data.name || '',
      email: data.email || '',
    };
    delete transformed.name;
    delete transformed.email;
  }

  // Transform context fields
  const contextFields = {};
  if (data.source) contextFields.source = data.source;
  if (data.sourceId) contextFields.sourceId = data.sourceId;
  if (data.chatId) contextFields.chatId = data.chatId;
  if (data.sessionId) contextFields.sessionId = data.sessionId;
  if (data.chatflowId) contextFields.chatflowId = data.chatflowId;

  if (Object.keys(contextFields).length > 0) {
    transformed.context = { ...transformed.context, ...contextFields };
  }

  // Clean up moved fields
  delete transformed.source;
  delete transformed.sourceId;
  delete transformed.chatId;
  delete transformed.sessionId;
  delete transformed.chatflowId;
  delete transformed.date; // Remove deprecated date field

  // Transform string fields to arrays
  const arrayFields = [
    'participants',
    'topics',
    'scopeCovered',
    'keyLearnings',
    'misconceptionsClarified',
    'studentStrengths',
    'gapsNextPriorities',
    'suggestedNextSteps',
    'questions',
    'compactRecap',
  ];

  arrayFields.forEach((field) => {
    if (transformed[field] && typeof transformed[field] === 'string') {
      // Split by newlines or use as single-item array
      const value = transformed[field].trim();
      if (value) {
        transformed[field] = value
          .split('\n')
          .map((item) => item.trim())
          .filter((item) => item.length > 0);
      } else {
        transformed[field] = [];
      }
    }
  });

  // Transform sources string to array of objects
  if (transformed.sources && typeof transformed.sources === 'string') {
    const sourcesText = transformed.sources.trim();
    if (sourcesText) {
      // Simple transformation: create generic source entries
      transformed.sources = sourcesText
        .split('\n')
        .map((line) => ({
          type: 'reference',
          ref: line.trim(),
        }))
        .filter((s) => s.ref);
    } else {
      transformed.sources = [];
    }
  }

  return transformed;
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
 * Format a report field for HTML output (handles arrays).
 * @param {string} label
 * @param {string | string[] | undefined} value
 * @returns {string | undefined}
 */
function formatField(label, value) {
  if (!value || (Array.isArray(value) && value.length === 0)) {
    return undefined;
  }

  if (Array.isArray(value)) {
    const items = value.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
    return `<p><strong>${label}:</strong><ul>${items}</ul></p>`;
  }

  const escaped = escapeHtml(value).replace(/\n/g, '<br />');
  return `<p><strong>${label}:</strong><br />${escaped}</p>`;
}

/**
 * Format a report field for plain-text output (handles arrays).
 * @param {string} label
 * @param {string | string[] | undefined} value
 * @returns {string | undefined}
 */
function formatFieldText(label, value) {
  if (!value || (Array.isArray(value) && value.length === 0)) {
    return undefined;
  }

  if (Array.isArray(value)) {
    const items = value.map((item, idx) => `  ${idx + 1}. ${item}`).join('\n');
    return `${label}:\n${items}`;
  }

  return `${label}:\n${value}`;
}

/**
 * Send a summary report email when configured.
 * @param {any} report
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
        value: report.context?.sourceId
          ? `${report.context.source} (${report.context.sourceId})`
          : report.context?.source,
      },
      { label: 'Student Name', value: report.identity?.name },
      { label: 'Student Email', value: report.identity?.email },
      { label: 'Student ID', value: report.studentId },
      { label: 'Participants', value: report.participants },
      { label: 'Topics', value: report.topics },
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
      { label: 'Compact Recap', value: report.compactRecap },
      { label: 'Chat ID', value: report.context?.chatId },
      { label: 'Session ID', value: report.context?.sessionId },
      { label: 'Chatflow ID', value: report.context?.chatflowId },
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
    const headerData = extractHeaderData(req);

    // Transform legacy format if needed
    const transformedPayload = transformLegacyFormat(req.body?.payload || {});

    // Deep merge context
    const mergedPayload = {
      ...transformedPayload,
      ...headerData,
      context: {
        ...transformedPayload?.context,
        ...headerData.context,
        source: 'flowise',
        sourceId: req.body?.id ?? '',
      },
      identity: {
        ...transformedPayload?.identity,
        ...headerData.identity,
      },
    };

    const { payload } = flowiseSchema.parse({ payload: mergedPayload });
    const client = extractClient(req);

    const doc = await SummaryReport.create({
      ...payload,
      client,
    });

    await maybeSendReportEmail(payload);
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
    const headerData = extractHeaderData(req);

    // Transform legacy format if needed
    const transformedBody = transformLegacyFormat(req.body || {});

    // Deep merge
    const mergedData = {
      ...transformedBody,
      ...headerData,
      context: {
        ...transformedBody?.context,
        ...headerData.context,
        source: 'manual',
      },
      identity: {
        ...transformedBody?.identity,
        ...headerData.identity,
      },
    };

    const body = baseReportSchema.parse(mergedData);
    const client = extractClient(req);

    const doc = await SummaryReport.create({
      ...body,
      client,
    });

    await maybeSendReportEmail(body);
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
}

/**
 * List the most recent summary reports, optionally filtered by studentId.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function listSummaryReports(req, res, next) {
  try {
    const { studentId } = req.query;

    // Build filter query
    const filter = {};
    if (studentId) {
      filter.studentId = studentId;
    }

    const items = await SummaryReport.find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    res.json(items);
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieve a summary report by identifier with optional student validation.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function getSummaryReport(req, res, next) {
  try {
    const { id } = idSchema.parse(req.params);
    const { studentId } = req.query;

    const doc = await SummaryReport.findById(id).lean();

    if (!doc) {
      res.status(404).json({
        status: 404,
        code: 'REPORT_NOT_FOUND',
        message: 'Summary report not found',
      });
      return;
    }

    // Optional: Validate that report belongs to requested student
    if (studentId && doc.studentId?.toString() !== studentId) {
      res.status(403).json({
        status: 403,
        code: 'FORBIDDEN',
        message: 'You do not have permission to access this report',
      });
      return;
    }

    res.json(doc);
  } catch (err) {
    next(err);
  }
}

/**
 * Get summary reports for students linked to a guardian.
 * Guardian email must be provided in the 'guardian-email' header.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function getGuardianReports(req, res, next) {
  try {
    const guardianEmail = req.headers['guardian-email'];

    if (!guardianEmail) {
      res.status(401).json({
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'Guardian email is required in headers',
      });
      return;
    }

    // Normalize email
    const normalizedEmail =
      typeof guardianEmail === 'string'
        ? guardianEmail.toLowerCase().trim()
        : '';

    // Find all students linked to this guardian
    const students = await Student.find({
      'guardian.email': normalizedEmail,
    })
      .select('_id name nickname email')
      .lean();

    if (!students || students.length === 0) {
      res.status(404).json({
        status: 404,
        code: 'NO_STUDENTS_FOUND',
        message: 'No students found for this guardian email',
      });
      return;
    }

    const studentIds = students.map((s) => s._id);

    // Get all reports for those students
    const reports = await SummaryReport.find({
      studentId: { $in: studentIds },
    })
      .sort({ createdAt: -1 })
      .populate('studentId', 'name nickname email')
      .lean();

    res.json({
      success: true,
      data: {
        guardian: { email: normalizedEmail },
        students: students.map((s) => ({
          _id: s._id,
          name: s.name,
          nickname: s.nickname,
          email: s.email,
        })),
        reports,
        count: reports.length,
      },
    });
  } catch (err) {
    next(err);
  }
}
