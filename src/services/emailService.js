import { randomUUID } from 'crypto';
import { resend } from '../lib/email/resend.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { buildStudentSubmissionEmail } from './emailTemplates/studentSubmission.js';

const MAIL_FROM =
  process.env.MAIL_FROM ||
  env.emailFrom ||
  env.mailFrom ||
  'Equus Tutor <noreply@example.com>';
const MAIL_REPLY_TO =
  process.env.MAIL_REPLY_TO || env.mailReplyTo || '';
const MAIL_RETURN_PATH =
  process.env.MAIL_RETURN_PATH || env.mailReturnPath || '';
const MAIL_BCC =
  process.env.MAIL_BCC ||
  process.env.MAILER_BCC ||
  process.env.EMAIL_BCC ||
  env.mailBcc ||
  '';
const MAIL_TAG_CATEGORY =
  process.env.MAIL_TAG_CATEGORY || env.mailTagCategory || '';

const hasRequiredConfig = () =>
  Boolean(process.env.RESEND_API_KEY && MAIL_FROM);

const toList = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => toList(item));
  }

  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const mergeRecipients = (...inputs) => {
  const seen = new Set();
  const result = [];

  for (const input of inputs) {
    for (const addr of toList(input)) {
      const key = addr.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(addr);
      }
    }
  }

  return result;
};

const optionalList = (list) => (list.length ? list : undefined);

const mergeTags = (tags) => {
  const base = MAIL_TAG_CATEGORY
    ? [{ name: 'category', value: MAIL_TAG_CATEGORY }]
    : [];
  const provided = Array.isArray(tags) ? tags : [];
  const seen = new Set();
  const merged = [];

  for (const tag of [...base, ...provided]) {
    if (!tag || !tag.name || !tag.value) continue;
    const key = `${tag.name}:${tag.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ name: tag.name, value: tag.value });
  }

  return merged;
};

const buildHeaders = (headers = {}) => {
  const merged = {
    'X-Entity-Ref-ID': randomUUID(),
    ...headers,
  };

  if (MAIL_RETURN_PATH && !merged['Return-Path']) {
    merged['Return-Path'] = MAIL_RETURN_PATH;
  }

  return Object.keys(merged).length ? merged : undefined;
};

async function sendEmail({
  to,
  subject,
  html,
  text,
  cc,
  bcc,
  attachments,
  headers,
  tags,
  idempotencyKey,
  replyTo,
  from,
}) {
  if (!hasRequiredConfig()) {
    const error = new Error(
      'Email service not configured: set RESEND_API_KEY and MAIL_FROM',
    );
    throw error;
  }

  const key = idempotencyKey || `email/${randomUUID()}`;
  const recipients = mergeRecipients(to);
  if (!recipients.length) {
    throw new Error('Email requires at least one recipient');
  }

  const ccList = mergeRecipients(cc);
  const bccList = mergeRecipients(MAIL_BCC, bcc);
  const payload = {
    from: from || MAIL_FROM,
    to: recipients,
    subject,
    html,
    text,
    cc: optionalList(ccList),
    bcc: optionalList(bccList),
    attachments: attachments && attachments.length ? attachments : undefined,
    headers: buildHeaders(headers),
    tags: optionalList(mergeTags(tags)),
    reply_to: replyTo || MAIL_REPLY_TO || undefined,
  };

  const { data, error } = await resend.emails.send(
    payload,
    { idempotencyKey: key },
  );

  if (error) {
    const e = new Error(error.message || 'Resend send failed');
    e.cause = error;
    throw e;
  }

  logger.info(
    { emailId: data?.id, subject, to: payload.to },
    'Email sent successfully via Resend.',
  );

  return { id: data?.id, idempotencyKey: key };
}

async function send(options) {
  try {
    const result = await sendEmail(options);
    return { success: true, ...result };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Email send failed';
    logger.error({ err: error }, 'Email send failed.');
    return { success: false, error: message };
  }
}

async function sendStudentSubmissionAlert(payload) {
  if (!env.studentAlertTo) {
    logger.warn(
      'studentAlertTo not configured; skipping student submission email.',
    );
    return {
      success: false,
      skipped: true,
      error: 'studentAlertTo not configured',
    };
  }

  const { html, text } = buildStudentSubmissionEmail(payload);
  const subject = `New Student: ${payload.name}`;

  return send({
    to: env.studentAlertTo,
    subject,
    html,
    text,
    tags: [{ name: 'category', value: 'student_submission' }],
  });
}

function getStatus() {
  return {
    configured: hasRequiredConfig(),
    provider: 'resend',
    from: MAIL_FROM || 'not-set',
    replyTo: MAIL_REPLY_TO || 'not-set',
    defaultBcc: MAIL_BCC ? '***configured***' : 'not-set',
    defaultTagCategory: MAIL_TAG_CATEGORY || 'not-set',
  };
}

export const emailService = {
  send,
  getStatus,
  sendStudentSubmissionAlert,
};
