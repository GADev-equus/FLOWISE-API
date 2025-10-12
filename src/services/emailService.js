import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { buildStudentSubmissionEmail } from './emailTemplates/studentSubmission.js';

/**
 * @typedef {string | string[]} Address
 */

/**
 * @typedef {Object} SendEmailOptions
 * @property {Address} to
 * @property {string} subject
 * @property {string} [html]
 * @property {string} [text]
 * @property {string} [from]
 * @property {Address} [bcc]
 */

/**
 * @typedef {Object} SendResult
 * @property {boolean} success
 * @property {string} [messageId]
 * @property {boolean} [skipped]
 * @property {string} [error]
 */

/**
 * @typedef {Object} StudentSubmissionEmail
 * @property {string} name
 * @property {string} [nickname]
 * @property {string} email
 * @property {number} [age]
 * @property {{ name?: string; email?: string }} guardian
 * @property {Array<{ subject: string; examBody: string; level: string; books?: string[]; examDates?: string[] }>} enrolments
 * @property {string} [preferredColourForDyslexia]
 * @property {string} [chatId]
 * @property {string} [sessionId]
 * @property {string} [chatflowId]
 * @property {'manual' | 'flowise'} source
 * @property {string} [sourceId]
 */

const resolveHost = () => process.env.MAILER_HOST || env.emailHost;
const resolvePort = () => Number(process.env.MAILER_PORT || env.emailPort || 587);
const resolveUser = () => process.env.MAILER_USER || env.emailUser;
const resolvePass = () => process.env.MAILER_PW || env.emailPass;

const resolveFromAddress = () =>
  process.env.MAILER_FROM || env.emailFrom || env.mailFrom || resolveUser() || 'no-reply@example.com';

const resolveBccAddress = (override) => override || process.env.MAILER_BCC || undefined;

const hasRequiredConfig = () => Boolean(resolveHost() && resolveUser() && resolvePass());

const createTransporter = () =>
  nodemailer.createTransport({
    host: resolveHost(),
    port: resolvePort(),
    secure: resolvePort() === 465,
    auth: {
      user: resolveUser(),
      pass: resolvePass(),
    },
    tls: {
      rejectUnauthorized: false,
    },
  });

const normalizeRecipients = (recipients) =>
  Array.isArray(recipients) ? recipients.join(', ') : recipients;

const normalizeEnvelopeRecipients = (recipients) =>
  Array.isArray(recipients) ? recipients : normalizeRecipients(recipients);

/**
 * Dispatch an email using the configured transport.
 * @param {SendEmailOptions} options
 * @returns {Promise<SendResult>}
 */
async function send(options) {
  if (!hasRequiredConfig()) {
    logger.warn('Email service not configured (MAILER_HOST, MAILER_USER, MAILER_PW required).');
    return { success: false, skipped: true, error: 'Email service not configured' };
  }

  if (!options.to || !options.subject || (!options.html && !options.text)) {
    return { success: false, error: 'Missing required email fields: to, subject, content' };
  }

  const transporter = createTransporter();
  const senderAddress = resolveUser() || resolveFromAddress();
  const fromAddress = options.from || resolveFromAddress();
  const mailOptions = {
    from: fromAddress,
    to: normalizeRecipients(options.to),
    bcc: resolveBccAddress(options.bcc),
    subject: options.subject,
    html: options.html,
    text: options.text,
    envelope: {
      from: senderAddress,
      to: normalizeEnvelopeRecipients(options.to),
    },
    replyTo: options.from ? options.from : undefined,
    sender: senderAddress,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    logger.info({ to: mailOptions.to }, 'Email sent successfully.');
    return { success: true, messageId: info.messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ err: message }, 'Email send failed.');
    return { success: false, error: message };
  }
}

function getStatus() {
  return {
    configured: hasRequiredConfig(),
    host: resolveHost() || 'not-set',
    port: resolvePort(),
    user: resolveUser() ? '***configured***' : 'not-set',
    from: resolveFromAddress(),
  };
}

/**
 * Notify configured recipients about a new student submission.
 * @param {StudentSubmissionEmail} payload
 * @param {{ to?: Address; subject?: string }} [overrides]
 * @returns {Promise<SendResult>}
 */
async function sendStudentSubmissionAlert(payload, overrides = {}) {
  const to = overrides.to || env.studentAlertTo;
  if (!to) {
    logger.warn('studentAlertTo not configured; skipping student submission email.');
    return { success: false, skipped: true, error: 'studentAlertTo not configured' };
  }

  const { html, text } = buildStudentSubmissionEmail(payload);
  const subject = overrides.subject || `New Student: ${payload.name}`;

  return send({ to, subject, html, text });
}

export const emailService = {
  send,
  getStatus,
  sendStudentSubmissionAlert,
};


