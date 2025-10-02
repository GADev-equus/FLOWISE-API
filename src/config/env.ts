import 'dotenv/config';

const num = (value: string | undefined, fallback: number): number =>
  value ? Number(value) : fallback;

const parseOrigins = (origins: string | undefined): string[] =>
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
  issueAlertTo: process.env.ISSUE_ALERT_TO ?? process.env.BUG_ALERT_TO ?? '',
  summaryReportAlertTo:
    process.env.SUMMARY_REPORT_ALERT_TO ?? process.env.ISSUE_ALERT_TO ?? '',
};

