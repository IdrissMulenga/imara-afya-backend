import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../core/logger.js';

mongoose.set('strictQuery', true);

mongoose.set('bufferCommands', false);

export const connectDatabase = async (): Promise<void> => {
  mongoose.connection.on('error', (error) => {
    logger.error('MongoDB connection error', { error: String(error) });
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });

  mongoose.connection.on('reconnected', () => {
    logger.info('MongoDB reconnected');
  });

  await mongoose.connect(env.MONGODB_URI);

  logger.info('MongoDB connected', { poolSize: env.DB_POOL_SIZE });
};

export const disconnectDatabase = async (): Promise<void> => {
  await mongoose.connection.close(false);
  logger.info('MongoDB pool closed');
};

export const databaseReady = (): boolean => mongoose.connection.readyState === 1;


export const syncIndexes = async (): Promise<void> => {
  if (!env.IS_PRODUCTION) return;

  const names = Object.keys(mongoose.models);
  for (const name of names) {
    await mongoose.models[name]!.createIndexes();
  }
  logger.info('Indexes synchronised', { models: names.length });
};
