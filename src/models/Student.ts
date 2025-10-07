import { Schema, model } from 'mongoose';

const isEmail = (value: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const enrolmentSchema = new Schema(
  {
    subject: { type: String, required: true },
    examBody: {
      type: String,
      enum: ['AQA', 'EdExcel', 'OCR', 'WJEC', 'CIE', 'Other'],
      required: true,
    },
    level: {
      type: String,
      enum: ['GCSE', 'AS', 'A-Level', 'IGCSE', 'IB', 'Other'],
      required: true,
    },
    books: { type: [String], default: [] },
    examDates: { type: [String], default: [] },
  },
  { _id: false }
);

const guardianSchema = new Schema(
  {
    name: { type: String, default: '' },
    email: {
      type: String,
      default: '',
      unique: true,
      lowercase: true,
      trim: true,
      validate: {
        validator(value: string): boolean {
          return value === '' || isEmail(value);
        },
        message: 'Please provide a valid guardian email address',
      },
    },
  },
  { _id: false }
);

const studentSchema = new Schema(
  {
    source: { type: String, default: 'manual' },
    sourceId: { type: String, default: '' },
    name: { type: String, required: true },
    nickname: { type: String, default: '' },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      validate: {
        validator: isEmail,
        message: 'Please provide a valid email address',
      },
      index: true,
    },
    enrolments: { type: [enrolmentSchema], default: [] },
    age: { type: Number, min: 4, max: 25 },
    guardian: { type: guardianSchema, default: () => ({}) },
    preferredColourForDyslexia: { type: String, default: '' },
    chatId: { type: String, default: '' },
    sessionId: { type: String, default: '' },
    chatflowId: { type: String, default: '' },
    client: {
      ip: { type: String, default: '' },
      userAgent: { type: String, default: '' },
    },
  },
  { timestamps: true, collection: 'students' }
);

studentSchema.index({ email: 1 }, { unique: true });

export const Student = model('Student', studentSchema);




