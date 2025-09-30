import { Schema, model } from 'mongoose';

const itemSchema = new Schema(
  {
    title: { type: String, required: true },
    data: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export const Item = model('Item', itemSchema);
