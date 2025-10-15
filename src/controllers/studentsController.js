import { z } from 'zod';
import { emailService } from '../services/emailService.js';
import { Student } from '../models/Student.js';
import { logger } from '../utils/logger.js';

const enrolmentSchema = z.object({
  subject: z.string().min(1, 'Subject is required'),
  country: z.string().min(1, 'Country is required'),
  examBody: z.string().min(1, 'Exam body is required'),
  level: z.string().min(1, 'Level is required'),
  books: z.array(z.string()).optional().default([]),
  examDates: z.array(z.string()).optional().default([]),
});

const guardianSchema = z.object({
  name: z.string().trim().min(1, 'Guardian name is required'),
  email: z
    .string()
    .trim()
    .min(1, 'Guardian email is required')
    .email('Guardian email must be valid'),
});

const flowContextSchema = z.object({
  chatId: z.string().optional(),
  sessionId: z.string().optional(),
  chatflowId: z.string().optional(),
});

const manualBaseSchema = z
  .object({
    name: z.string().min(1),
    nickname: z.string().optional().default(''),
    email: z.string().email(),
    enrolments: z
      .array(enrolmentSchema)
      .min(1, 'At least one subject is required'),
    age: z.number().int().min(4).max(25).optional(),
    guardian: guardianSchema,
    preferredColourForDyslexia: z.string().optional().default(''),
  })
  .merge(flowContextSchema)
  .superRefine((data, ctx) => {
    const studentEmail = data.email?.trim().toLowerCase();
    const guardianEmail = data.guardian?.email?.trim().toLowerCase();

    if (studentEmail && guardianEmail && studentEmail === guardianEmail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['guardian', 'email'],
        message: 'Guardian email must be different from student email.',
      });
    }
  });

const manualSchema = z.preprocess((data) => {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const clone = { ...data };
  const guardian = clone.guardian;

  if (typeof guardian === 'string') {
    clone.guardian = { email: guardian.trim() };
  } else if (guardian && typeof guardian === 'object') {
    const candidate = guardian;
    const name =
      typeof candidate.name === 'string'
        ? candidate.name.trim()
        : candidate.name;
    const email =
      typeof candidate.email === 'string'
        ? candidate.email.trim()
        : candidate.email;
    clone.guardian = {
      ...candidate,
      ...(name !== undefined ? { name } : {}),
      ...(email !== undefined ? { email } : {}),
    };
  }

  return clone;
}, manualBaseSchema);

const flowiseSchema = z.object({
  id: z.string().optional(),
  payload: manualSchema,
});

const studentIdSchema = z.object({
  id: z.string().min(1, 'Student id is required'),
});

/**
 * @typedef {Object} GuardianInfo
 * @property {string} name
 * @property {string} email
 */

/**
 * @typedef {Object} Enrolment
 * @property {string} subject
 * @property {string} country
 * @property {string} examBody
 * @property {string} level
 * @property {string[]} [books]
 * @property {string[]} [examDates]
 */

/**
 * @typedef {Object} NormalizedStudent
 * @property {string} name
 * @property {string} nickname
 * @property {string} email
 * @property {number} [age]
 * @property {GuardianInfo} guardian
 * @property {Enrolment[]} enrolments
 * @property {string} [preferredColourForDyslexia]
 * @property {string} [chatId]
 * @property {string} [sessionId]
 * @property {string} [chatflowId]
 */

/**
 * @typedef {NormalizedStudent & {source: 'manual' | 'flowise', sourceId?: string}} StudentEmailPayload
 */

/**
 * @typedef {Object} ClientInfo
 * @property {string} ip
 * @property {string} userAgent
 */

/**
 * @typedef {Object} DuplicateKeyError
 * @property {number} code
 * @property {Record<string, any>} [keyValue]
 * @property {Record<string, any>} [keyPattern]
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
 * Optionally send student submission email notifications.
 * @param {StudentEmailPayload} student
 */
async function maybeSendStudentEmail(student) {
  try {
    const result = await emailService.sendStudentSubmissionAlert({
      name: student.name,
      nickname: student.nickname,
      email: student.email,
      age: student.age,
      guardian: {
        name: student.guardian.name,
        email: student.guardian.email,
      },
      enrolments: student.enrolments.map((enrolment) => ({
        subject: enrolment.subject,
        country: enrolment.country,
        examBody: enrolment.examBody,
        level: enrolment.level,
        books: enrolment.books,
        examDates: enrolment.examDates,
      })),
      preferredColourForDyslexia: student.preferredColourForDyslexia,
      chatId: student.chatId,
      sessionId: student.sessionId,
      chatflowId: student.chatflowId,
      source: student.source,
      sourceId: student.sourceId,
    });

    if (!result.success && !result.skipped) {
      logger.warn({ err: result.error }, 'Failed to send student alert email');
    }
  } catch (error) {
    logger.warn({ err: error }, 'Failed to send student alert email');
  }
}

/**
 * Determine whether an error is a Mongo duplicate key error.
 * @param {unknown} error
 * @returns {error is DuplicateKeyError}
 */
function isDuplicateKeyError(error) {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return false;
  }

  const { code } = /** @type {{ code?: unknown }} */ (error);
  return code === 11000;
}

/**
 * Resolve duplicate key error details to an API response.
 * @param {DuplicateKeyError} error
 */
function resolveDuplicateField(error) {
  const keyValue = error.keyValue ?? {};
  const keyPattern = error.keyPattern ?? {};
  const key = Object.keys(keyValue)[0] ?? Object.keys(keyPattern)[0] ?? 'email';

  if (key.includes('guardian')) {
    return {
      code: 'STUDENT_GUARDIAN_EMAIL_EXISTS',
      message: 'Guardian email is already associated with another student.',
    };
  }

  return {
    code: 'STUDENT_EMAIL_EXISTS',
    message: 'Student email address is already registered.',
  };
}

/**
 * Handle duplicate key errors during student creation.
 * @param {import('express').Response} res
 * @param {unknown} error
 */
function handleDuplicateKeyError(res, error) {
  if (!isDuplicateKeyError(error)) {
    return false;
  }

  const { code, message } = resolveDuplicateField(error);
  res.status(409).json({ status: 409, code, message });
  return true;
}

/**
 * Normalize fields for persistence and downstream use.
 * @param {NormalizedStudent} input
 * @returns {NormalizedStudent}
 */
function normalizeStudentPayload(input) {
  const trimmedNickname = input.nickname?.trim() ?? '';
  const normalizedGuardian = {
    name: input.guardian.name.trim(),
    email: input.guardian.email.trim().toLowerCase(),
  };

  const enrolments = input.enrolments.map((enrolment) => ({
    ...enrolment,
    subject: enrolment.subject.trim(),
    country: enrolment.country.trim(),
    books: enrolment.books?.map((book) => book.trim()).filter(Boolean) ?? [],
    examDates:
      enrolment.examDates?.map((date) => date.trim()).filter(Boolean) ?? [],
  }));

  return {
    ...input,
    name: input.name.trim(),
    nickname: trimmedNickname,
    email: input.email.trim().toLowerCase(),
    guardian: normalizedGuardian,
    preferredColourForDyslexia: input.preferredColourForDyslexia?.trim() ?? '',
    chatId: input.chatId?.trim(),
    sessionId: input.sessionId?.trim(),
    chatflowId: input.chatflowId?.trim(),
    enrolments,
  };
}

/**
 * Check whether the incoming student collides with existing emails.
 * @param {NormalizedStudent} payload
 * @returns {Promise<{ code: string; message: string } | null>}
 */
async function hasEmailConflicts(payload) {
  if (await Student.exists({ email: payload.email })) {
    return {
      code: 'STUDENT_EMAIL_EXISTS',
      message: 'Student email address is already registered.',
    };
  }

  return null;
}

/**
 * Respond with 409 if there is an email conflict.
 * @param {import('express').Response} res
 * @param {NormalizedStudent} payload
 */
async function respondIfEmailConflict(res, payload) {
  const conflict = await hasEmailConflicts(payload);
  if (!conflict) {
    return false;
  }

  res.status(409).json({ status: 409, ...conflict });
  return true;
}

/**
 * Create a student from a manual submission.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function createStudent(req, res, next) {
  try {
    const parsed = manualSchema.parse(req.body);
    const body = normalizeStudentPayload(parsed);
    const client = extractClient(req);

    if (await respondIfEmailConflict(res, body)) {
      return;
    }

    const doc = await Student.create({
      source: 'manual',
      ...body,
      client,
    });

    await maybeSendStudentEmail({ ...body, source: 'manual' });
    res.status(201).json(doc);
  } catch (error) {
    if (handleDuplicateKeyError(res, error)) {
      return;
    }
    next(error);
  }
}

/**
 * Create a student from a Flowise webhook payload.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function createStudentFromFlowise(req, res, next) {
  try {
    const { id, payload } = flowiseSchema.parse(req.body);
    const body = normalizeStudentPayload(payload);
    const client = extractClient(req);

    if (await respondIfEmailConflict(res, body)) {
      return;
    }

    const doc = await Student.create({
      source: 'flowise',
      sourceId: id ?? '',
      ...body,
      client,
    });

    await maybeSendStudentEmail({ ...body, source: 'flowise', sourceId: id });
    res.status(202).json({ received: true, id: doc._id });
  } catch (error) {
    if (handleDuplicateKeyError(res, error)) {
      return;
    }
    next(error);
  }
}

/**
 * List students ordered by creation date.
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function listStudents(_req, res, next) {
  try {
    const items = await Student.find().sort({ createdAt: -1 }).lean();
    res.json(items);
  } catch (error) {
    next(error);
  }
}

/**
 * Retrieve a single student by identifier.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function getStudent(req, res, next) {
  try {
    const { id } = studentIdSchema.parse(req.params);
    const doc = await Student.findById(id).lean();

    if (!doc) {
      res.status(404).json({
        status: 404,
        code: 'STUDENT_NOT_FOUND',
        message: 'Student not found',
      });
      return;
    }

    res.json(doc);
  } catch (error) {
    next(error);
  }
}

/**
 * Verify if student email exists in database.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function verifyEmail(req, res, next) {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({
        success: false,
        message: 'Email is required',
      });
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();

    // Check if student exists
    const student = await Student.findOne({ email: trimmedEmail }).lean();

    if (!student) {
      res.status(404).json({
        success: false,
        message: 'Email not found in our records',
      });
      return;
    }

    // Return student info (without sensitive data)
    res.status(200).json({
      success: true,
      data: {
        email: student.email,
        name: student.name,
        nickname: student.nickname || '',
      },
    });
  } catch (error) {
    next(error);
  }
}
