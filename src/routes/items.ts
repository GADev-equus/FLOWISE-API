import { Router } from 'express';
import { z } from 'zod';
import { Item } from '../models/Item.js';

export const items = Router();

items.get('/items', async (_req, res, next) => {
  try {
    const list = await Item.find().sort({ createdAt: -1 }).lean();
    res.json(list);
  } catch (err) {
    next(err);
  }
});

const createSchema = z.object({
  title: z.string().min(1),
  data: z.record(z.string(), z.any()).optional(),
});

items.post('/items', async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    const doc = await Item.create(body);
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
});
