import 'dotenv/config';

const num = (value, fallback) =>
  value ? Number(value) : fallback;

const parseOrigins = (origins) =>
  (origins ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: num(process.env.PORT, 8000),
  apiPrefix: process.env.API_PREFIX ?? '/api/v1',
  mongodbUri: process.env.MONGODB_URI ?? '',
  corsOrigins: parseOrigins(process.env.CORS_ORIGINS),
  resendKey: process.env.RESEND_API_KEY ?? '',
  mailFrom: process.env.MAIL_FROM ?? '',
  emailHost: process.env.EMAIL_HOST ?? '',
  emailPort: num(process.env.EMAIL_PORT, 587),
  emailUser: process.env.EMAIL_USER ?? '',
  emailPass: process.env.EMAIL_PASS ?? '',
  emailFrom: process.env.EMAIL_FROM ?? process.env.MAIL_FROM ?? '',
  emailTimeout: num(process.env.EMAIL_TIMEOUT, 10000),
  emailRetryAttempts: num(process.env.EMAIL_RETRY_ATTEMPTS, 3),
  issueAlertTo: process.env.ISSUE_ALERT_TO ?? process.env.BUG_ALERT_TO ?? '',
  summaryReportAlertTo:
    process.env.SUMMARY_REPORT_ALERT_TO ?? process.env.ISSUE_ALERT_TO ?? '',
  studentAlertTo:
    process.env.STUDENT_ALERT_TO ??
    process.env.SUMMARY_REPORT_ALERT_TO ??
    process.env.ISSUE_ALERT_TO ??
    '',
};


