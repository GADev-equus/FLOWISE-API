import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { emailService } from '../services/emailService.js';
import { Student } from '../models/Student.js';
import { logger } from '../utils/logger.js';

const enrolmentSchema = z.object({
  subject: z.string().min(1),
  examBody: z.enum(['AQA', 'EdExcel', 'OCR', 'WJEC', 'CIE', 'Other']),
  level: z.enum(['GCSE', 'AS', 'A-Level', 'IGCSE', 'IB', 'Other']),
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

  const clone = { ...(data as Record<string, unknown>) };
  const guardian = clone.guardian;

  if (typeof guardian === 'string') {
    clone.guardian = { email: guardian.trim() };
  } else if (guardian && typeof guardian === 'object') {
    const candidate = guardian as Record<string, unknown>;
    const name = typeof candidate.name === 'string' ? candidate.name.trim() : candidate.name;
    const email = typeof candidate.email === 'string' ? candidate.email.trim() : candidate.email;
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

type ManualStudent = z.infer<typeof manualSchema>;
type FlowiseStudent = z.infer<typeof flowiseSchema>;

type ClientInfo = {
  ip: string;
  userAgent: string;
};

type StudentEmailPayload = NormalizedStudent & {
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

async function maybeSendStudentEmail(student: StudentEmailPayload): Promise<void> {
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
    name: input.guardian.name.trim(),
    email: input.guardian.email.trim().toLowerCase(),
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












