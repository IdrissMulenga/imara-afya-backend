import type { Server } from 'node:http';
import { env, envWarnings } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import { createApp } from './app.js';

//STARTING AND STOPPING.
//
//Connect to the database BEFORE opening the port. Anything that can fail
//permanently should fail before we start accepting traffic — a process that
//never listens gets replaced by the platform, while one that listens and
//half-works serves errors to real users.

const start = async (): Promise<void> => {
  for (const warning of envWarnings()) {
    console.warn(`[config] ${warning}`);
  }

  await connectDB();

  const app = createApp();
  const server: Server = app.listen(env.PORT, () => {
    console.log(`[server] listening on ${env.PORT} (${env.NODE_ENV})`);
  });

  //GRACEFUL SHUTDOWN.
  //
  //Stop accepting new connections, let in-flight requests finish, THEN close
  //the database. Closing the database first would fail every request that is
  //still running — the opposite of graceful.
  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    //A second Ctrl-C must not close the pool underneath requests the first one
    //is still draining.
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[server] shutting down (${signal})`);

    //A hung request must not hold the process open forever.
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

  //An unhandled rejection leaves the process in an unknown state. Log it and
  //let the platform restart a clean one.
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
