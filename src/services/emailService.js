import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { buildStudentSubmissionEmail } from './emailTemplates/studentSubmission.js';

/**
 * @typedef {{ to: string | string[], subject: string, html?: string, text?: string }} SimpleMailOptions
 */

const resolveHost = () =>
  process.env.MAILER_HOST || env.emailHost || 'localhost';

const resolvePort = () =>
  Number(process.env.MAILER_PORT ?? env.emailPort ?? 587);

const resolveUser = () => process.env.MAILER_USER || env.emailUser;
const resolvePass = () => process.env.MAILER_PW || env.emailPass;
const resolveFrom = () =>
  process.env.MAILER_FROM ||
  env.emailFrom ||
  env.mailFrom ||
  resolveUser() ||
  'no-reply@example.com';

const resolveBcc = () =>
  process.env.MAILER_BCC || env.emailBcc || undefined;

const hasRequiredConfig = () =>
  Boolean(resolveHost() && resolveUser() && resolvePass());

const createTransporter = () => {
  const host = resolveHost();
  const port = resolvePort();
  const secure = port === 465;

  if (host === 'localhost' || host === '127.0.0.1') {
    logger.warn(
      'MAILER_HOST is set to localhost; ensure an SMTP server is running locally or configure remote SMTP credentials.',
    );
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: resolveUser(),
      pass: resolvePass(),
    },
    tls: {
      rejectUnauthorized: false,
    },
  });
};

export const sendEmail = (options) =>
  new Promise((resolve, reject) => {
    if (!hasRequiredConfig()) {
      const error = new Error(
        'Email service not configured: set MAILER_HOST, MAILER_USER, and MAILER_PW',
      );
      logger.error({ err: error.message }, 'Email send failed.');
      reject(error);
      return;
    }

    const transporter = createTransporter();
    const requestedFrom = options.from || resolveFrom();
    const senderAddress = resolveUser() || requestedFrom;
    const replyTo =
      requestedFrom && requestedFrom !== senderAddress ? requestedFrom : undefined;

    const mailOptions = {
      from: senderAddress,
      to: options.to,
      bcc: resolveBcc(),
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo,
    };

    transporter.sendMail(mailOptions, (err, info) => {
      if (err) {
        logger.error({ err }, 'Email send failed.');
        reject(err);
        return;
      }

      logger.info({ info }, 'Email sent successfully.');
      resolve(info);
    });
  });

async function send(options) {
  try {
    await sendEmail(options);
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Email send failed';
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

  return send({ to: env.studentAlertTo, subject, html, text });
}

function getStatus() {
  return {
    configured: hasRequiredConfig(),
    host: resolveHost() || 'not-set',
    port: resolvePort(),
    user: resolveUser() ? '***configured***' : 'not-set',
    from: resolveFrom() || 'not-set',
  };
}

export const emailService = {
  send,
  getStatus,
  sendStudentSubmissionAlert,
};
