import { Schema, model } from 'mongoose';

const issueSchema = new Schema(
  {
    source: { type: String, default: 'manual' },
    sourceId: { type: String },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    details: { type: String, default: '' },
    labels: { type: [String], default: [] },
    status: {
      type: String,
      enum: ['open', 'triaged', 'in_progress', 'resolved', 'closed'],
      default: 'open',
    },
    client: {
      ip: { type: String, default: '' },
      userAgent: { type: String, default: '' },
    },
  },
  { timestamps: true, collection: 'issues' }
);

export const Issue = model('Issue', issueSchema);
