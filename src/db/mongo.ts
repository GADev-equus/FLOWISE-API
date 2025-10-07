import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

export async function connectMongo(): Promise<void> {
  if (!env.mongodbUri) {
    throw new Error('MONGODB_URI is required');
  }

  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongodbUri);
  try {
    const { Student } = await import('../models/Student.js');
    await Student.syncIndexes();
  } catch (error) {
    logger.warn({ err: error }, 'Failed to sync student indexes');
  }

  logger.info('MongoDB connected');
}
