import { env } from '../../config/env.js';

export type StudentSubmissionEmail = {
  name: string;
  nickname?: string;
  email: string;
  age?: number;
  guardian: {
    name?: string;
    email?: string;
  };
  enrolments: Array<{
    subject: string;
    examBody: string;
    level: string;
    books?: string[];
    examDates?: string[];
  }>;
  preferredColourForDyslexia?: string;
  chatId?: string;
  sessionId?: string;
  chatflowId?: string;
  source: 'manual' | 'flowise';
  sourceId?: string;
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatList = (label: string, items: string[] | undefined): string => {
  if (!items || items.length === 0) {
    return '';
  }

  const content = items.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  return `<p><strong>${label}:</strong></p><ul>${content}</ul>`;
};

const formatListText = (label: string, items: string[] | undefined): string => {
  if (!items || items.length === 0) {
    return '';
  }

  const content = items.map((item) => `  - ${item}`).join('\n');
  return `${label}:\n${content}`;
};

const sanitizeNumber = (value: number | undefined): string | undefined => {
  if (value === undefined || Number.isNaN(value)) {
    return undefined;
  }
  return String(value);
};

export const buildStudentSubmissionEmail = (
  payload: StudentSubmissionEmail,
): { html: string; text: string } => {
  const guardianName = payload.guardian.name?.trim() || 'Not provided';
  const guardianEmail = payload.guardian.email?.trim() || 'Not provided';
  const nickname = payload.nickname?.trim();
  const preferredColour = payload.preferredColourForDyslexia?.trim();
  const age = sanitizeNumber(payload.age);

  const enrolmentsHtml = payload.enrolments
    .map((enrolment, index) => {
      const header = `${escapeHtml(enrolment.subject)} &middot; ${escapeHtml(
        enrolment.examBody,
      )} (${escapeHtml(enrolment.level)})`;
      const books = formatList('Study resources', enrolment.books);
      const examDates = formatList('Planned exam dates', enrolment.examDates);
      return `
        <section style="margin-bottom: 20px;">
          <p><strong>Enrolment ${index + 1}:</strong><br />${header}</p>
          ${books}
          ${examDates}
        </section>
      `;
    })
    .join('');

  const enrolmentsText = payload.enrolments
    .map((enrolment, index) => {
      const header = `Enrolment ${index + 1}: ${enrolment.subject} - ${enrolment.examBody} (${enrolment.level})`;
      const books = formatListText('Study resources', enrolment.books);
      const examDates = formatListText('Planned exam dates', enrolment.examDates);
      return [header, books, examDates].filter(Boolean).join('\n');
    })
    .join('\n\n');

  const sourceDetails = payload.sourceId
    ? `${escapeHtml(payload.source)} (id: ${escapeHtml(payload.sourceId)})`
    : escapeHtml(payload.source);

  const metaHtml = [
    age ? `<p><strong>Age:</strong> ${escapeHtml(age)}</p>` : '',
    preferredColour ? `<p><strong>Preferred colour:</strong> ${escapeHtml(preferredColour)}</p>` : '',
    payload.chatId ? `<p><strong>Chat ID:</strong> ${escapeHtml(payload.chatId)}</p>` : '',
    payload.sessionId ? `<p><strong>Session ID:</strong> ${escapeHtml(payload.sessionId)}</p>` : '',
    payload.chatflowId ? `<p><strong>Chatflow ID:</strong> ${escapeHtml(payload.chatflowId)}</p>` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const metaText = [
    age ? `Age: ${age}` : '',
    preferredColour ? `Preferred colour: ${preferredColour}` : '',
    payload.chatId ? `Chat ID: ${payload.chatId}` : '',
    payload.sessionId ? `Session ID: ${payload.sessionId}` : '',
    payload.chatflowId ? `Chatflow ID: ${payload.chatflowId}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const timestamp = new Date().toISOString();

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
      <h1 style="font-size: 20px;">New student submission received</h1>
      <p><strong>Name:</strong> ${escapeHtml(payload.name)}</p>
      <p><strong>Nickname:</strong> ${escapeHtml(nickname || 'Not provided')}</p>
      <p><strong>Email:</strong> <a href="mailto:${escapeHtml(payload.email)}">${escapeHtml(
        payload.email,
      )}</a></p>
      <p><strong>Guardian:</strong> ${escapeHtml(guardianName)} (${escapeHtml(guardianEmail)})</p>
      ${metaHtml}
      <p><strong>Source:</strong> ${sourceDetails}</p>
      <hr style="margin: 24px 0;" />
      ${enrolmentsHtml}
      <hr style="margin: 24px 0;" />
      <p style="font-size: 12px; color: #555;">
        Environment: ${escapeHtml(env.nodeEnv)} | Sent at ${escapeHtml(timestamp)}
      </p>
    </div>
  `;

  const sourceSuffix = payload.sourceId ? ` (id: ${payload.sourceId})` : '';
  const textSections = [
    'New student submission received',
    `Name: ${payload.name}`,
    `Nickname: ${nickname || 'Not provided'}`,
    `Email: ${payload.email}`,
    `Guardian: ${guardianName} (${guardianEmail})`,
    metaText,
    `Source: ${payload.source}${sourceSuffix}`,
    '',
    enrolmentsText,
    '',
    `Environment: ${env.nodeEnv}`,
    `Sent at: ${timestamp}`,
  ].filter(Boolean);

  const text = textSections.join('\n');

  return { html, text };
};
