import type { Server } from 'node:http';
import { env, envWarnings } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import { createApp } from './app.js';
import { purgeDeletedUsers } from './modules/user/index.js';

//How often interrupted account deletions are finished.
const PURGE_INTERVAL_MS = 60 * 60 * 1000;

//Finishes interrupted account deletions, logging rather than throwing.
const purge = (): void => {
  purgeDeletedUsers()
    .then((erased) => {
      if (erased > 0) console.log(`[user] finished erasing ${erased} deleted account(s)`);
    })
    .catch((error) => console.error('[user] deleted-account sweep failed:', error));
};

//Connects to the database, then starts the HTTP server.

const start = async (): Promise<void> => {
  for (const warning of envWarnings()) {
    console.warn(`[config] ${warning}`);
  }

  await connectDB();

  purge();
  setInterval(purge, PURGE_INTERVAL_MS).unref();

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
