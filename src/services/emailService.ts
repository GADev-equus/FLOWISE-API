import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { buildStudentSubmissionEmail, StudentSubmissionEmail } from './emailTemplates/studentSubmission.js';

type Address = string | string[];

type SendEmailOptions = {
  to: Address;
  subject: string;
  html?: string;
  text?: string;
  from?: string;
};

type SendResult = {
  success: boolean;
  messageId?: string;
  skipped?: boolean;
  error?: string;
};

const wait = (durationMs: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });

class EmailService {
  private transporter: Transporter | null = null;
  private configured = false;

  private hasRequiredConfig(): boolean {
    return Boolean(env.emailHost && env.emailUser && env.emailPass);
  }

  private buildTransporter(): Transporter | null {
    if (!this.hasRequiredConfig()) {
      logger.warn('Email service not configured (EMAIL_HOST, EMAIL_USER, EMAIL_PASS required).');
      this.configured = false;
      this.transporter = null;
      return null;
    }

    if (this.transporter) {
      return this.transporter;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: env.emailHost,
        port: env.emailPort,
        secure: env.emailPort === 465,
        auth: {
          user: env.emailUser,
          pass: env.emailPass,
        },
        connectionTimeout: env.emailTimeout,
        greetingTimeout: env.emailTimeout,
        socketTimeout: env.emailTimeout,
      });
      this.configured = true;
      logger.info('Email service transporter initialised.');
      return this.transporter;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ err: message }, 'Failed to initialise email transporter.');
      this.transporter = null;
      this.configured = false;
      return null;
    }
  }

  getStatus() {
    return {
      configured: this.configured && this.hasRequiredConfig(),
      host: env.emailHost || 'not-set',
      port: env.emailPort,
      user: env.emailUser ? '***configured***' : 'not-set',
      from: this.resolveFromAddress(),
    };
  }

  private resolveFromAddress(): string {
    return env.emailFrom || env.mailFrom || env.emailUser || 'no-reply@example.com';
  }

  async send(options: SendEmailOptions): Promise<SendResult> {
    const transporter = this.buildTransporter();
    if (!transporter) {
      return { success: false, skipped: true, error: 'Email service not configured' };
    }

    if (!options.to || !options.subject || (!options.html && !options.text)) {
      return { success: false, error: 'Missing required email fields: to, subject, content' };
    }

    const recipients = Array.isArray(options.to) ? options.to.join(', ') : options.to;
    const attempts = Math.max(1, env.emailRetryAttempts || 1);
    const mailOptions = {
      from: options.from || this.resolveFromAddress(),
      to: recipients,
      subject: options.subject,
      html: options.html,
      text: options.text,
    };

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await transporter.sendMail(mailOptions);
        logger.info({ to: recipients, attempt }, 'Email sent successfully.');
        this.configured = true;
        return { success: true, messageId: response.messageId };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ err: message, attempt }, 'Email send failed.');
        if (attempt === attempts) {
          return {
            success: false,
            error: `Failed to send email after ${attempts} attempts: ${message}`,
          };
        }
        await wait(1000 * attempt);
      }
    }

    return { success: false, error: 'Email send failed' };
  }

  async sendStudentSubmissionAlert(
    payload: StudentSubmissionEmail,
    overrides: { to?: Address; subject?: string } = {},
  ): Promise<SendResult> {
    const to = overrides.to || env.studentAlertTo;
    if (!to) {
      logger.warn('studentAlertTo not configured; skipping student submission email.');
      return { success: false, skipped: true, error: 'studentAlertTo not configured' };
    }

    const { html, text } = buildStudentSubmissionEmail(payload);
    const subject = overrides.subject || `New Student: ${payload.name}`;

    return this.send({ to, subject, html, text });
  }
}

export const emailService = new EmailService();
export type { StudentSubmissionEmail } from './emailTemplates/studentSubmission.js';


