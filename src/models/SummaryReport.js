import { Schema, model } from 'mongoose';

const summaryReportSchema = new Schema(
  {
    source: { type: String, default: 'manual' }, // 'flowise' | 'manual'
    sourceId: { type: String, default: '' },
    title: { type: String, required: true },
    date: { type: String, required: true },
    participants: { type: String, required: true },
    scopeCovered: { type: String, required: true },
    keyLearnings: { type: String, required: true },
    misconceptionsClarified: { type: String, default: '' },
    studentStrengths: { type: String, default: '' },
    gapsNextPriorities: { type: String, default: '' },
    suggestedNextSteps: { type: String, default: '' },
    questions: { type: String, default: '' },
    sources: { type: String, default: '' },
    compactRecap: { type: String, default: '' },
    name: { type: String, default: '' },
    email: { type: String, default: '' },
    chatId: { type: String, default: '' },
    sessionId: { type: String, default: '' },
    chatflowId: { type: String, default: '' },
    client: {
      ip: { type: String, default: '' },
      userAgent: { type: String, default: '' },
    },
  },
  { timestamps: true, collection: 'summary_reports' },
);

export const SummaryReport = model('SummaryReport', summaryReportSchema);
