import mongoose from 'mongoose';
import { env } from './env.js';

//THE DATABASE CONNECTION.

mongoose.set('strictQuery', true);

//Without this, a query made before the connection is up gets QUEUED and the
//request hangs for ten seconds instead of failing. On a slow network that
//silence is what makes a user force-close the app.
mongoose.set('bufferCommands', false);

export const connectDB = async (): Promise<void> => {
  mongoose.connection.on('error', (e) => console.error('[db] error:', String(e)));
  mongoose.connection.on('disconnected', () => console.warn('[db] disconnected'));
  mongoose.connection.on('reconnected', () => console.log('[db] reconnected'));

  await mongoose.connect(env.MONGODB_URI, {
    maxPoolSize: env.DB_POOL_SIZE,
    //Give up rather than queue forever behind a server that is not coming back.
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
  });

  console.log(`[db] connected (pool: ${env.DB_POOL_SIZE})`);
};

//`false` means "do not force" — in-flight queries finish first.
export const disconnectDB = async (): Promise<void> => {
  await mongoose.connection.close(false);
  console.log('[db] closed');
};

//1 = connected. Used by /health.
export const isDBReady = (): boolean => mongoose.connection.readyState === 1;
