import express, { type Express, type Request, type RequestHandler } from 'express';
import cors from 'cors';
import { createYoga } from 'graphql-yoga';
import { env } from '../config/env.js';
import { databaseReady } from '../config/database.js';
import { buildSchema } from '../core/schema.js';
import { clientIp, type Context } from '../core/context.js';
import { logger } from '../core/logger.js';
import { modules } from '../modules/index.js';
import { authenticate } from '../modules/auth/auth.context.js';
import { securityHeaders } from './middleware/securityHeaders.js';
import { ipRateLimit } from './middleware/rateLimit.js';
import { securityPlugin } from './middleware/depthLimit.js';
import { operationLimitPlugin } from './middleware/operationLimit.js';

//What express gives yoga on every request.
interface ServerContext {
  req: Request;
  res: express.Response;
}

export const createApp = (): Express => {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(securityHeaders);

  app.use(
    cors({
      origin: env.ALLOWED_ORIGINS === '*' ? true : env.ALLOWED_ORIGINS,
      credentials: true,
      //The app sends its device identifier and session origin as headers
      //rather than as arguments on every single operation.
      allowedHeaders: ['Content-Type', 'Authorization', 'x-device-id', 'x-session-origin'],
    })
  );

  app.use(express.json({ limit: env.BODY_LIMIT }));

  app.get('/health', (_req, res) => {
    const ready = databaseReady();
    res.status(ready ? 200 : 503).json({
      status: ready ? 'ok' : 'degraded',
      database: ready ? 'connected' : 'disconnected',
      uptimeSeconds: Math.floor(process.uptime()),
    });
  });

  app.use('/graphql', ipRateLimit);

  const yoga = createYoga<ServerContext, Context>({
    schema: buildSchema(modules),
    graphqlEndpoint: '/graphql',
    graphiql: env.GRAPHIQL,
    maskedErrors: false,
    landingPage: false,
    plugins: [securityPlugin, operationLimitPlugin],

    context: async ({ req }): Promise<Context> => {
      const { user, token } = await authenticate(req);

      return {
        user,
        token,
        ip: clientIp(req),
        request: req,
        now: new Date(),
      };
    },
  });

  //way to mount it and is the only place in the codebase that needs one.
  app.use('/graphql', yoga as unknown as RequestHandler);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  logger.info('HTTP pipeline ready', {
    graphiql: env.GRAPHIQL,
    cors: env.ALLOWED_ORIGINS === '*' ? 'any origin' : env.ALLOWED_ORIGINS.join(', '),
  });

  return app;
};
