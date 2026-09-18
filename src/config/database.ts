import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../core/logger.js';

//DATABASE CONNECTION.
//
//One pool per instance, sized by DB_POOL_SIZE. The number that matters is
//(instances x DB_POOL_SIZE) against the Atlas cluster's connection limit —
//a free or shared tier runs out long before the app does.

mongoose.set('strictQuery', true);

//Mongoose buffers commands issued before the connection is up and replays them
//when it lands. That turns a database that is down into requests that hang for
//ten seconds instead of failing. Fail fast and let the client retry.
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

  await mongoose.connect(env.MONGODB_URI, {
    maxPoolSize: env.DB_POOL_SIZE,
    //Give up on selecting a server rather than queueing forever behind one
    //that is not coming back.
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
  });

  logger.info('MongoDB connected', { poolSize: env.DB_POOL_SIZE });
};

export const disconnectDatabase = async (): Promise<void> => {
  await mongoose.connection.close(false);
  logger.info('MongoDB pool closed');
};

export const databaseReady = (): boolean => mongoose.connection.readyState === 1;

//INDEX CREATION.
//
//`autoIndex` is left on in development for convenience and turned OFF in
//production, where building an index on a live collection can lock it. There,
//indexes are created deliberately at boot, before traffic arrives.
export const syncIndexes = async (): Promise<void> => {
  if (!env.IS_PRODUCTION) return;

  const names = Object.keys(mongoose.models);
  for (const name of names) {
    await mongoose.models[name]!.createIndexes();
  }
  logger.info('Indexes synchronised', { models: names.length });
};
