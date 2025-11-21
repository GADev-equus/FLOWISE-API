import { z } from 'zod';
import { emailService } from '../services/emailService.js';
import { env } from '../config/env.js';
import { Student } from '../models/Student.js';
import { logger } from '../utils/logger.js';
import { DEFAULT_CHATFLOW_ID } from '../config/chatflowConstants.js';

const enrolmentSchema = z.object({
  subject: z.string().min(1, 'Subject is required'),
  country: z.string().min(1, 'Country is required'),
  examBody: z.string().min(1, 'Exam body is required'),
  level: z.string().min(1, 'Level is required'),
  books: z.array(z.string()).optional().default([]),
  examDates: z.array(z.string()).optional().default([]),
  chatflowId: z.string().optional().default(''),
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

const enrolmentIdSchema = z.object({
  id: z.string().min(1, 'Student id is required'),
});

const buildEnrolmentKey = (enrolment) =>
  [
    enrolment.subject,
    enrolment.country,
    enrolment.examBody,
    enrolment.level,
  ]
    .map((value) => (value || '').trim().toLowerCase())
    .join('|');

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

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
 * @property {string} [chatflowId]
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
        chatflowId: enrolment.chatflowId,
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

async function notifyEnrolmentAdded(student, enrolment) {
  if (!env.studentAlertTo) {
    logger.warn(
      'studentAlertTo not configured; skipping enrolment added email.',
    );
    return;
  }

  const subject = `Student added subject: ${enrolment.subject} (${enrolment.level})`;
  const lines = [
    `Email subject: ${subject}`,
    `Name: ${student.name}`,
    student.nickname ? `Nickname: ${student.nickname}` : undefined,
    `Email: ${student.email}`,
    student.source
      ? `Source: ${student.source}${
          student.sourceId ? ` (${student.sourceId})` : ''
        }`
      : undefined,
    `Subject: ${enrolment.subject}`,
    `Country: ${enrolment.country}`,
    `Exam body: ${enrolment.examBody}`,
    `Level: ${enrolment.level}`,
    enrolment.books?.length
      ? `Study resources: ${enrolment.books.join(', ')}`
      : undefined,
    enrolment.examDates?.length
      ? `Planned exam dates: ${enrolment.examDates.join(', ')}`
      : undefined,
    enrolment.chatflowId
      ? `Enrolment chatflow ID: ${enrolment.chatflowId}`
      : undefined,
    student.chatflowId ? `Student chatflow ID: ${student.chatflowId}` : undefined,
  ].filter(Boolean);

  const now = new Date().toISOString();
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 16px; background: #f7f9fc; color: #0f172a;">
      <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; box-shadow: 0 6px 14px rgba(15, 23, 42, 0.06);">
        <p style="margin: 0 0 8px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #475569;">
          Enrolment update
        </p>
        <h1 style="margin: 0 0 12px; font-size: 22px;">Student added a subject</h1>
        <p style="margin: 0 0 16px; color: #334155;"><strong>Email subject:</strong> ${escapeHtml(subject)}</p>
        <div style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; background: #f8fafc; margin-bottom: 14px;">
          <p style="margin: 0 0 8px;"><strong>Name:</strong> ${escapeHtml(student.name)}</p>
          ${student.nickname ? `<p style="margin: 0 0 8px;"><strong>Nickname:</strong> ${escapeHtml(student.nickname)}</p>` : ''}
          <p style="margin: 0 0 8px;"><strong>Email:</strong> <a href="mailto:${escapeHtml(student.email)}" style="color: #2563eb;">${escapeHtml(student.email)}</a></p>
          ${
            student.source
              ? `<p style="margin: 0 0 8px;"><strong>Source:</strong> ${escapeHtml(student.source)}${
                  student.sourceId ? ` (${escapeHtml(student.sourceId)})` : ''
                }</p>`
              : ''
          }
        </div>
        <div style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; background: #fff; margin-bottom: 14px;">
          <h2 style="margin: 0 0 10px; font-size: 16px;">Subject details</h2>
          <p style="margin: 0 0 6px;"><strong>Subject:</strong> ${escapeHtml(enrolment.subject)}</p>
          <p style="margin: 0 0 6px;"><strong>Country:</strong> ${escapeHtml(enrolment.country)}</p>
          <p style="margin: 0 0 6px;"><strong>Exam body:</strong> ${escapeHtml(enrolment.examBody)}</p>
          <p style="margin: 0 0 10px;"><strong>Level:</strong> ${escapeHtml(enrolment.level)}</p>
          ${
            enrolment.books?.length
              ? `<p style="margin: 0 0 6px;"><strong>Study resources:</strong> ${escapeHtml(enrolment.books.join(', '))}</p>`
              : ''
          }
          ${
            enrolment.examDates?.length
              ? `<p style="margin: 0;"><strong>Planned exam dates:</strong> ${escapeHtml(enrolment.examDates.join(', '))}</p>`
              : ''
          }
        </div>
        <div style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; background: #fff;">
          <p style="margin: 0 0 6px;"><strong>Enrolment chatflow ID:</strong> ${escapeHtml(enrolment.chatflowId || 'Not provided')}</p>
          <p style="margin: 0 0 6px;"><strong>Student chatflow ID:</strong> ${escapeHtml(student.chatflowId || 'Not provided')}</p>
          <p style="margin: 8px 0 0; font-size: 12px; color: #475569;">Environment: ${escapeHtml(env.nodeEnv)} · Sent at ${escapeHtml(now)}</p>
        </div>
      </div>
    </div>
  `;
  const text = [...lines, `Environment: ${env.nodeEnv}`, `Sent at: ${now}`].join(
    '\n',
  );

  try {
    const result = await emailService.send({
      to: env.studentAlertTo,
      subject,
      html,
      text,
      tags: [{ name: 'category', value: 'student_enrolment' }],
    });

    if (!result.success && !result.skipped) {
      logger.warn(
        { err: result.error },
        'Failed to send enrolment added email',
      );
    }
  } catch (error) {
    logger.warn({ err: error }, 'Failed to send enrolment added email');
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
  const normalizedChatflowId =
    input.chatflowId?.trim() || DEFAULT_CHATFLOW_ID;

  const enrolments = input.enrolments.map(normalizeEnrolment);

  return {
    ...input,
    name: input.name.trim(),
    nickname: trimmedNickname,
    email: input.email.trim().toLowerCase(),
    guardian: normalizedGuardian,
    preferredColourForDyslexia: input.preferredColourForDyslexia?.trim() ?? '',
    chatId: input.chatId?.trim(),
    sessionId: input.sessionId?.trim(),
    chatflowId: normalizedChatflowId,
    enrolments,
  };
}

/**
 * Normalize a single enrolment record for persistence/use.
 * @param {import('zod').infer<typeof enrolmentSchema>} enrolment
 * @param {string} [fallbackChatflowId] enrolment-level fallback
 * @param {string} [studentChatflowId] student-level fallback
 */
function normalizeEnrolment(enrolment, fallbackChatflowId, studentChatflowId) {
  const trim = (value) => (typeof value === 'string' ? value.trim() : value);

  const incomingFlow = trim(enrolment.chatflowId);
  const enrolmentFlow = fallbackChatflowId ? trim(fallbackChatflowId) : '';
  const studentFlow = studentChatflowId ? trim(studentChatflowId) : '';
  const isNonDefault = (value) =>
    Boolean(value && value !== DEFAULT_CHATFLOW_ID);

  const normalizedChatflow = (() => {
    if (isNonDefault(incomingFlow)) return incomingFlow;
    if (isNonDefault(enrolmentFlow)) return enrolmentFlow;
    if (isNonDefault(studentFlow)) return studentFlow;
    // At this point either everything is default/empty; prefer any provided value before falling back
    return incomingFlow || enrolmentFlow || studentFlow || DEFAULT_CHATFLOW_ID;
  })();

  return {
    ...enrolment,
    subject: trim(enrolment.subject),
    country: trim(enrolment.country),
    examBody: trim(enrolment.examBody),
    level: trim(enrolment.level),
    books: enrolment.books?.map((book) => trim(book)).filter(Boolean) ?? [],
    examDates:
      enrolment.examDates?.map((date) => trim(date)).filter(Boolean) ?? [],
    chatflowId: normalizedChatflow,
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
        _id: student._id.toString(),
        email: student.email,
        name: student.name,
        nickname: student.nickname || '',
        enrolments: (student.enrolments || []).map((enrolment) => ({
          subject: enrolment.subject,
          country: enrolment.country,
          examBody: enrolment.examBody,
          level: enrolment.level,
          books: enrolment.books,
          examDates: enrolment.examDates,
          chatflowId: enrolment.chatflowId || DEFAULT_CHATFLOW_ID,
        })),
        chatflowId: student.chatflowId || DEFAULT_CHATFLOW_ID,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Append a new enrolment to an existing student.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function addStudentEnrolment(req, res, next) {
  try {
    const { id } = enrolmentIdSchema.parse(req.params);
    const enrolment = enrolmentSchema.parse(req.body);
    const normalized = normalizeEnrolment(enrolment);
    const enrolmentKey = buildEnrolmentKey(normalized);

    const student = await Student.findById(id).lean();

    if (!student) {
      res.status(404).json({
        status: 404,
        code: 'STUDENT_NOT_FOUND',
        message: 'Student not found',
      });
      return;
    }

    const existingKeys = (student.enrolments || []).map(buildEnrolmentKey);
    if (existingKeys.includes(enrolmentKey)) {
      res.status(409).json({
        status: 409,
        code: 'ENROLMENT_ALREADY_EXISTS',
        message:
          'This subject is already on your profile. Please edit the existing enrolment instead.',
      });
      return;
    }

    const updated = await Student.findByIdAndUpdate(
      id,
      { $push: { enrolments: normalized } },
      { new: true, lean: true },
    );

    if (!updated) {
      res.status(404).json({
        status: 404,
        code: 'STUDENT_NOT_FOUND',
        message: 'Student not found',
      });
      return;
    }

    await notifyEnrolmentAdded(updated, normalized);
    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
}

/**
 * Update an existing enrolment on a student by index.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function updateStudentEnrolment(req, res, next) {
  try {
    const { id } = enrolmentIdSchema.parse(req.params);
    const indexRaw = req.params?.index;
    const index = Number.parseInt(indexRaw, 10);

    if (Number.isNaN(index) || index < 0) {
      res.status(400).json({
        status: 400,
        code: 'INVALID_ENROLMENT_INDEX',
        message: 'Enrolment index must be a non-negative number',
      });
      return;
    }

    const enrolment = enrolmentSchema.parse(req.body);

    const student = await Student.findById(id).lean();

    if (!student) {
      res.status(404).json({
        status: 404,
        code: 'STUDENT_NOT_FOUND',
        message: 'Student not found',
      });
      return;
    }

    const enrolments = student.enrolments || [];
    if (index >= enrolments.length) {
      res.status(404).json({
        status: 404,
        code: 'ENROLMENT_NOT_FOUND',
        message: 'Enrolment not found for this student',
      });
      return;
    }

    const existingKeys = enrolments.map(buildEnrolmentKey);
    // Allow updating the same slot without tripping duplicate check
    const otherKeys = existingKeys.filter((_, idx) => idx !== index);

    const normalized = normalizeEnrolment(
      enrolment,
      enrolments[index]?.chatflowId,
      student.chatflowId,
    );
    const enrolmentKey = buildEnrolmentKey(normalized);
    if (otherKeys.includes(enrolmentKey)) {
      res.status(409).json({
        status: 409,
        code: 'ENROLMENT_ALREADY_EXISTS',
        message:
          'This subject already exists on your profile. Please edit the existing enrolment instead.',
      });
      return;
    }

    const updatedEnrolments = [...enrolments];
    updatedEnrolments[index] = normalized;

    const updated = await Student.findByIdAndUpdate(
      id,
      { enrolments: updatedEnrolments },
      { new: true, lean: true },
    );

    if (!updated) {
      res.status(404).json({
        status: 404,
        code: 'STUDENT_NOT_FOUND',
        message: 'Student not found',
      });
      return;
    }

    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
}
