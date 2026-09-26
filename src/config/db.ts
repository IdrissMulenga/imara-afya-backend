import mongoose from 'mongoose';
import { env, isLocalDatabase } from './env.js';

mongoose.set('strictQuery', true);

//Queries fail immediately while disconnected instead of queueing.
mongoose.set('bufferCommands', false);

//Connects to MongoDB and logs connection changes.
export const connectDB = async (): Promise<void> => {
  mongoose.connection.on('error', (e) => console.error('[db] error:', String(e)));
  mongoose.connection.on('disconnected', () => console.warn('[db] disconnected'));
  mongoose.connection.on('reconnected', () => console.log('[db] reconnected'));

  await mongoose.connect(env.MONGODB_URI, {
    maxPoolSize: env.DB_POOL_SIZE,
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
  });

  const { host, name } = mongoose.connection;
  const where = isLocalDatabase(env.MONGODB_URI) ? 'local' : 'remote';
  console.log(`[db] connected to ${where} database ${name} on ${host} (pool: ${env.DB_POOL_SIZE})`);
};

//Closes the connection, letting in-flight queries finish.
export const disconnectDB = async (): Promise<void> => {
  await mongoose.connection.close(false);
  console.log('[db] closed');
};

//True when connected. Used by /health.
export const isDBReady = (): boolean => mongoose.connection.readyState === 1;
