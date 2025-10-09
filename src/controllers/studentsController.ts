import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { Student } from '../models/Student.js';
import { logger } from '../utils/logger.js';

const enrolmentSchema = z.object({
  subject: z.string().min(1),
  examBody: z.enum(['AQA', 'EdExcel', 'OCR', 'WJEC', 'CIE', 'Other']),
  level: z.enum(['GCSE', 'AS', 'A-Level', 'IGCSE', 'IB', 'Other']),
  books: z.array(z.string()).optional().default([]),
  examDates: z.array(z.string()).optional().default([]),
});

const guardianSchema = z
  .object({
    name: z.string().optional().default(''),
    email: z.string().optional().default(''),
  })
  .optional()
  .default({ name: '', email: '' });

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
  .merge(flowContextSchema);

const manualSchema = z.preprocess((data) => {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const clone = { ...(data as Record<string, unknown>) };
  const guardian = clone.guardian;

  if (typeof guardian === 'string') {
    const trimmed = guardian.trim();
    clone.guardian = trimmed ? { email: trimmed } : undefined;
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

type ManualStudent = z.infer<typeof manualSchema>;
type FlowiseStudent = z.infer<typeof flowiseSchema>;

type ClientInfo = {
  ip: string;
  userAgent: string;
};

type StudentEmailPayload = ManualStudent & {
  source: 'manual' | 'flowise';
  sourceId?: string;
};

type DuplicateKeyError = {
  code: number;
  keyValue?: Record<string, unknown>;
  keyPattern?: Record<string, unknown>;
};

type NormalizedStudent = ManualStudent;

function extractClient(req: Request): ClientInfo {
  const forwarded = req.headers['x-forwarded-for'] as string | undefined;
  const ip = forwarded?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
  const userAgent = (req.headers['user-agent'] as string | undefined) ?? '';
  return { ip, userAgent };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderList(label: string, values: string[]): string | undefined {
  if (!values.length) {
    return undefined;
  }

  const listItems = values.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  return `<p><strong>${label}:</strong></p><ul>${listItems}</ul>`;
}

function formatGuardian(guardian: ManualStudent['guardian']): string | undefined {
  if (!guardian?.name && !guardian?.email) {
    return undefined;
  }

  const name = guardian?.name ? escapeHtml(guardian.name) : undefined;
  const email = guardian?.email ? escapeHtml(guardian.email) : undefined;
  const lines = [name ? `Name: ${name}` : undefined, email ? `Email: ${email}` : undefined]
    .filter(Boolean)
    .join('<br />');

  if (!lines) {
    return undefined;
  }

  return `<p><strong>Guardian:</strong><br />${lines}</p>`;
}

async function maybeSendStudentEmail(student: StudentEmailPayload): Promise<void> {
  if (!env.studentAlertTo) {
    return;
  }

  try {
    const { sendEmail } = await import('../services/mailer.js');
    const subject = `New Student: ${student.name}`;

    const guardianSection = formatGuardian(student.guardian);
    const enrolmentsHtml = student.enrolments
      .map((enrolment) => {
        const header = `${escapeHtml(enrolment.subject)} · ${escapeHtml(enrolment.examBody)} (${escapeHtml(enrolment.level)})`;
        const books = renderList('Books', enrolment.books ?? []);
        const examDates = renderList('Exam Dates', enrolment.examDates ?? []);
        return [`<p><strong>Enrolment:</strong><br />${header}</p>`, books, examDates]
          .filter(Boolean)
          .join('');
      })
      .join('');

    const details = [
      `<p><strong>Source:</strong> ${escapeHtml(student.source)}${
        student.sourceId ? ` (${escapeHtml(student.sourceId)})` : ''
      }</p>`,
      `<p><strong>Name:</strong> ${escapeHtml(student.name)}</p>`,
      student.nickname ? `<p><strong>Nickname:</strong> ${escapeHtml(student.nickname)}</p>` : undefined,
      `<p><strong>Email:</strong> ${escapeHtml(student.email)}</p>`,
      typeof student.age === 'number'
        ? `<p><strong>Age:</strong> ${student.age}</p>`
        : undefined,
      student.preferredColourForDyslexia
        ? `<p><strong>Preferred Colour:</strong> ${escapeHtml(student.preferredColourForDyslexia)}</p>`
        : undefined,
      guardianSection,
      enrolmentsHtml,
      student.chatId ? `<p><strong>Chat ID:</strong> ${escapeHtml(student.chatId)}</p>` : undefined,
      student.sessionId ? `<p><strong>Session ID:</strong> ${escapeHtml(student.sessionId)}</p>` : undefined,
      student.chatflowId ? `<p><strong>Chatflow ID:</strong> ${escapeHtml(student.chatflowId)}</p>` : undefined,
    ].filter(Boolean) as string[];

    if (!details.length) {
      return;
    }

    const html = details.join('');
    await sendEmail(env.studentAlertTo, subject, html);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to send student alert email');
  }
}

function isDuplicateKeyError(error: unknown): error is DuplicateKeyError {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as Partial<DuplicateKeyError>).code === 11000
  );
}

function resolveDuplicateField(error: DuplicateKeyError): { code: string; message: string } {
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

function handleDuplicateKeyError(res: Response, error: unknown): boolean {
  if (!isDuplicateKeyError(error)) {
    return false;
  }

  const { code, message } = resolveDuplicateField(error);
  res.status(409).json({ status: 409, code, message });
  return true;
}

function normalizeStudentPayload(input: ManualStudent): NormalizedStudent {
  const trimmedNickname = input.nickname?.trim() ?? '';
  const normalizedGuardian = {
    name: input.guardian?.name?.trim() ?? '',
    email: input.guardian?.email?.trim().toLowerCase() ?? '',
  };

  const enrolments = input.enrolments.map((enrolment) => ({
    ...enrolment,
    subject: enrolment.subject.trim(),
    books: enrolment.books?.map((book) => book.trim()).filter(Boolean) ?? [],
    examDates: enrolment.examDates?.map((date) => date.trim()).filter(Boolean) ?? [],
  })) as NormalizedStudent['enrolments'];

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

async function hasEmailConflicts(payload: NormalizedStudent): Promise<{ code: string; message: string } | null> {
  if (await Student.exists({ email: payload.email })) {
    return {
      code: 'STUDENT_EMAIL_EXISTS',
      message: 'Student email address is already registered.',
    };
  }

  if (payload.guardian.email) {
    const guardianExists = await Student.exists({ 'guardian.email': payload.guardian.email });
    if (guardianExists) {
      return {
        code: 'STUDENT_GUARDIAN_EMAIL_EXISTS',
        message: 'Guardian email is already associated with another student.',
      };
    }
  }

  return null;
}

async function respondIfEmailConflict(
  res: Response,
  payload: NormalizedStudent,
): Promise<boolean> {
  const conflict = await hasEmailConflicts(payload);
  if (!conflict) {
    return false;
  }

  res.status(409).json({ status: 409, ...conflict });
  return true;
}

export async function createStudent(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
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

export async function createStudentFromFlowise(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id, payload }: FlowiseStudent = flowiseSchema.parse(req.body);
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

export async function listStudents(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const items = await Student.find().sort({ createdAt: -1 }).lean();
    res.json(items);
  } catch (error) {
    next(error);
  }
}

export async function getStudent(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = studentIdSchema.parse(req.params);
    const doc = await Student.findById(id).lean();

    if (!doc) {
      res.status(404).json({ status: 404, code: 'STUDENT_NOT_FOUND', message: 'Student not found' });
      return;
    }

    res.json(doc);
  } catch (error) {
    next(error);
  }
}

