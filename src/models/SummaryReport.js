import { Schema, model } from 'mongoose';

const summaryReportSchema = new Schema(
  {
    // Public record ID (virtual - will use _id)
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    title: { type: String, required: true },

    identity: {
      name: { type: String, required: true },
      email: { type: String, required: true },
    },

    context: {
      chatId: { type: String, default: '' },
      sessionId: { type: String, default: '' },
      chatflowId: { type: String, default: '' },
      source: { type: String, default: 'manual' }, // 'manual' | 'api' | 'import'
      sourceId: { type: String, default: '' },
    },

    participants: {
      type: [String],
      required: true,
      default: [],
    },

    sections: [
      {
        board: { type: String, required: true },
        code: { type: String, required: true },
        label: { type: String, default: '' },
      },
    ],

    topics: {
      type: [String],
      default: [],
    },

    scopeCovered: {
      type: [String],
      required: true,
      default: [],
    },

    keyLearnings: {
      type: [String],
      default: [],
    },

    misconceptionsClarified: {
      type: [String],
      default: [],
    },

    studentStrengths: {
      type: [String],
      default: [],
    },

    gapsNextPriorities: {
      type: [String],
      default: [],
    },

    suggestedNextSteps: {
      type: [String],
      default: [],
    },

    questions: {
      type: [String],
      default: [],
    },

    sources: [
      {
        type: { type: String, required: true }, // 'spec' | 'textbook' | 'paper'
        board: { type: String, default: '' },
        ref: { type: String, required: true },
      },
    ],

    compactRecap: {
      type: [String],
      default: [],
    },

    client: {
      ip: { type: String, default: '' },
      userAgent: { type: String, default: '' },
    },

    meta: {
      schemaVersion: { type: Number, default: 1 },
    },
  },
  {
    timestamps: true,
    collection: 'summary_reports',
  },
);

// Virtual for public ID (maps to _id)
summaryReportSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

// Ensure virtuals are included in JSON output
summaryReportSchema.set('toJSON', {
  virtuals: true,
  transform: function (doc, ret) {
    ret.id = ret._id.toHexString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

// Indexes for common query patterns
summaryReportSchema.index({ studentId: 1, createdAt: -1 }); // List by student
summaryReportSchema.index({ 'identity.email': 1 }); // Search by email
summaryReportSchema.index({ topics: 1 }); // Topic filtering (multikey)
summaryReportSchema.index({ 'sections.board': 1, 'sections.code': 1 }); // Exam board search
summaryReportSchema.index({ 'context.chatflowId': 1 }); // Flowise integration
summaryReportSchema.index({ 'context.source': 1, createdAt: -1 }); // Filter by source
summaryReportSchema.index({ createdAt: -1 }); // Recent reports

export const SummaryReport = model('SummaryReport', summaryReportSchema);
