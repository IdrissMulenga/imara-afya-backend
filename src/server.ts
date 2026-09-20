import type { Server } from 'node:http';
import { env, auditEnv } from './config/env.js';
import { connectDatabase, disconnectDatabase, syncIndexes } from './config/database.js';
import { logger } from './core/logger.js';
import { createApp } from './http/app.js';
import { modules } from './modules/index.js';
import {
  registerOwnedModels,
  assertPurgeCoverage,
} from './modules/auth/services/account.service.js';

const start = async (): Promise<void> => {
  for (const warning of auditEnv()) {
    logger.warn(warning);
  }

  for (const module of modules) {
    registerOwnedModels(module.ownedModels ?? []);
  }

  await connectDatabase();
  assertPurgeCoverage();
  await syncIndexes();

  for (const module of modules) {
    if (module.onStart) {
      await module.onStart();
      logger.debug('Module started', { module: module.name });
    }
  }

  const app = createApp();
  const server: Server = app.listen(env.PORT, () => {
    logger.info('Imara Afya API listening', {
      port: env.PORT,
      env: env.NODE_ENV,
      modules: modules.length,
    });
  });

  //still running, which is the opposite of graceful.
  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    //A second Ctrl-C must not close the pool underneath requests that the
    //first one is still draining.
    if (shuttingDown) {
      logger.warn('Shutdown already in progress', { signal });
      return;
    }
    shuttingDown = true;
    logger.info('Shutting down', { signal });

    //A request that hangs must not hold the process open forever. The platform
    //will SIGKILL us eventually anyway; exiting on our own terms at least runs
    //the pool close.
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
