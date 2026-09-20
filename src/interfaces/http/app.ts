import express, { type Express, type Request, type RequestHandler } from 'express';
import cors from 'cors';
import { createYoga } from 'graphql-yoga';
import type { GraphQLSchema } from 'graphql';
import { env } from '../../infrastructure/config/env.js';
import { databaseReady } from '../../infrastructure/database/mongoose/connection.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { clientIp, type GraphQLContext, type AuthenticatedCaller } from '../graphql/context.js';
import { securityHeaders } from './middleware/security-headers.js';
import { ipRateLimit } from './middleware/ip-rate-limit.js';
import { securityPlugin } from '../graphql/plugins/depth-limit.plugin.js';
import { operationLimitPlugin } from '../graphql/plugins/operation-limit.plugin.js';

//THE REQUEST PIPELINE.
//
//  security headers
//  -> CORS
//  -> body size cap
//  -> /health          (ABOVE the limiter, so an uptime monitor polling every
//                       ten seconds cannot exhaust the IP budget and report an
//                       outage it caused itself)
//  -> per-IP rate limit
//  -> graphql-yoga
//       -> depth limit + introspection control
//       -> per-operation rate limit
//       -> context
//       -> resolvers
//
//The schema and the authenticator are INJECTED. This file builds a pipeline;
//it does not know which features exist or how a token is verified.

interface ServerContext {
  req: Request;
  res: express.Response;
}

export interface AppDeps {
  schema: GraphQLSchema;
  authenticate: (
    request: Request
  ) => Promise<{ caller?: AuthenticatedCaller; token?: string }>;
}

export const createApp = (deps: AppDeps): Express => {
  const app = express();

  //`req.ip` is only trustworthy when express is told how many proxies sit in
  //front. Both rate limiters key on it.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(securityHeaders);

  app.use(
    cors({
      origin: env.ALLOWED_ORIGINS === '*' ? true : env.ALLOWED_ORIGINS,
      credentials: true,
      //The app sends its device identifier and session origin as headers
      //rather than as arguments on every operation.
      allowedHeaders: ['Content-Type', 'Authorization', 'x-device-id', 'x-session-origin'],
    })
  );

  app.use(express.json({ limit: env.BODY_LIMIT }));

  //Reports whether this instance can actually serve, not merely that the
  //process is alive. A container that is up but cannot reach Mongo should be
  //replaced, not sent traffic.
  app.get('/health', (_req, res) => {
    const ready = databaseReady();
    res.status(ready ? 200 : 503).json({
      status: ready ? 'ok' : 'degraded',
      database: ready ? 'connected' : 'disconnected',
      uptimeSeconds: Math.floor(process.uptime()),
    });
  });

  app.use('/graphql', ipRateLimit);

  const yoga = createYoga<ServerContext, GraphQLContext>({
    schema: deps.schema,
    graphqlEndpoint: '/graphql',
    graphiql: env.GRAPHIQL,
    //Yoga masks unexpected errors by default. Ours are already converted by
    //the error mapper, so masking again would replace our codes with a generic
    //one and the app would lose the ability to branch.
    maskedErrors: false,
    landingPage: false,
    plugins: [securityPlugin, operationLimitPlugin],

    context: async ({ req }): Promise<GraphQLContext> => {
      const { caller, token } = await deps.authenticate(req);
      return {
        caller,
        token,
        ip: clientIp(req),
        request: req,
        now: new Date(),
      };
    },
  });

  //Yoga is a fetch handler, not an express one. The cast is the documented way
  //to mount it and is the only one in the codebase.
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
