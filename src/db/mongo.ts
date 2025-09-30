import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

export async function connectMongo(): Promise<void> {
  if (!env.mongodbUri) {
    throw new Error('MONGODB_URI is required');
  }

  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongodbUri);
  logger.info('MongoDB connected');
}
