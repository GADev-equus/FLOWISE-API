import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export async function sendEmail(to: string, subject: string, html: string): Promise<unknown> {
  if (!env.resendKey || !env.mailFrom) {
    logger.warn('Email not configured (RESEND_API_KEY / MAIL_FROM missing). Skipping send.');
    return { skipped: true };
  }

  const { Resend } = await import('resend');
  const resend = new Resend(env.resendKey);

  const result = await resend.emails.send({
    from: env.mailFrom,
    to,
    subject,
    html,
  });

  return result;
}
