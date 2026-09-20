import type { Server } from 'node:http';
import { env, auditEnv } from './infrastructure/config/env.js';
import {
  connectDatabase,
  disconnectDatabase,
  syncIndexes,
} from './infrastructure/database/mongoose/connection.js';
import { logger } from './infrastructure/logging/logger.js';
import { createContainer, assertPurgeCoverage } from './container.js';
import { createApp } from './interfaces/http/app.js';

//BOOT AND SHUTDOWN.
//
//Boot order is deliberate:
//  1. warn about configuration that works but should not reach production
//  2. connect the database — models must be registered with mongoose first,
//     which importing the container does
//  3. assert deletion coverage, and refuse to start on a gap
//  4. sync indexes (production only)
//  5. listen
//
//Anything that can fail permanently fails BEFORE the port is open. A process
//that never listens gets replaced by the platform; one that listens and
//half-works serves errors to real users.

const start = async (): Promise<void> => {
  for (const warning of auditEnv()) {
    logger.warn(warning);
  }

  //Building the container imports every schema, which is what registers the
  //models that assertPurgeCoverage then walks.
  const container = createContainer();

  await connectDatabase();
  assertPurgeCoverage();
  await syncIndexes();

  const app = createApp({
    schema: container.schema,
    authenticate: container.authenticate,
  });

  const server: Server = app.listen(env.PORT, () => {
    logger.info('Imara Afya API listening', { port: env.PORT, env: env.NODE_ENV });
  });

  //GRACEFUL SHUTDOWN.
  //
  //Stop accepting connections, let in-flight requests finish, THEN close the
  //database pool. Closing the pool first fails every request still running,
  //which is the opposite of graceful.
  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    //A second Ctrl-C must not close the pool underneath requests the first one
    //is still draining.
    if (shuttingDown) {
      logger.warn('Shutdown already in progress', { signal });
      return;
    }
    shuttingDown = true;
    logger.info('Shutting down', { signal });

    //A hung request must not hold the process open forever. The platform will
    //SIGKILL eventually anyway; exiting on our own terms at least closes the
    //pool cleanly.
    const forceExit = setTimeout(() => {
      logger.error('Shutdown timed out, exiting now');
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    await new Promise<void>((resolve) => server.close(() => resolve()));
    await disconnectDatabase();

    clearTimeout(forceExit);
    logger.info('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  //An unhandled rejection leaves the process in an unknown state. Log it with
  //its stack and let the platform restart a clean one.
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error: error.message, stack: error.stack });
    process.exit(1);
  });
};

start().catch((error: unknown) => {
  logger.error('Failed to start', {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});
