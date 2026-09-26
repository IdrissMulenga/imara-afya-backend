import type { Server } from 'node:http';
import { env, envWarnings } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import { createApp } from './app.js';
import { dropDailyUniqueIndex } from './modules/checkin/index.js';

//Connects to the database, then starts the HTTP server.

const start = async (): Promise<void> => {
  for (const warning of envWarnings()) {
    console.warn(`[config] ${warning}`);
  }

  await connectDB();
  await dropDailyUniqueIndex().catch((error) => {
    console.warn('[db] could not drop the old daily check-in index:', error);
  });

  const app = createApp();
  const server: Server = app.listen(env.PORT, () => {
    console.log(`[server] listening on ${env.PORT} (${env.NODE_ENV})`);
  });

  //Graceful shutdown: stop accepting requests, drain, then close the database.
  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[server] shutting down (${signal})`);

    const forceExit = setTimeout(() => {
      console.error('[server] shutdown timed out, exiting');
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    await new Promise<void>((resolve) => server.close(() => resolve()));
    await disconnectDB();

    clearTimeout(forceExit);
    console.log('[server] stopped');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    console.error('[server] unhandled rejection:', reason);
  });

  process.on('uncaughtException', (error) => {
    console.error('[server] uncaught exception:', error);
    process.exit(1);
  });
};

start().catch((error) => {
  console.error('[server] failed to start:', error);
  process.exit(1);
});
