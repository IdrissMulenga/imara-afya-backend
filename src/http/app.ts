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

//THE REQUEST PIPELINE.
//
//  security headers
//  -> CORS
//  -> body size cap
//  -> /health (before the rate limiter, so a monitor never trips it)
//  -> per-IP rate limit
//  -> graphql-yoga
//       -> depth limit + introspection control
//       -> per-operation rate limit
//       -> context (who is calling)
//       -> resolvers
//
//Order matters at every step. The health check sits above the limiter because
//an uptime monitor polling every ten seconds would otherwise exhaust the IP
//budget and report an outage it caused itself.

//What express gives yoga on every request.
interface ServerContext {
  req: Request;
  res: express.Response;
}

export const createApp = (): Express => {
  const app = express();

  //`req.ip` is only trustworthy when express is told how many proxies sit in
  //front. Both rate limiters key on it, and reading x-forwarded-for directly
  //would let any caller mint a fresh budget per request.
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

  //Yoga's first generic is the SERVER context express hands it (req/res); the
  //second is what our resolvers receive. Naming both keeps the schema's
  //context type and the resolvers' in agreement.
  const yoga = createYoga<ServerContext, Context>({
    schema: buildSchema(modules),
    graphqlEndpoint: '/graphql',
    graphiql: env.GRAPHIQL,
    //Yoga masks unexpected errors by default. Ours are already converted in
    //core/errors, so masking again would replace our codes with a generic one
    //and the app would lose the ability to branch.
    maskedErrors: false,
    landingPage: false,
    plugins: [securityPlugin, operationLimitPlugin],

    //Yoga hands us a Fetch API request; the express one is what carries `ip`
    //(resolved through `trust proxy`) and the headers the app sets, so that is
    //the one the rest of the codebase gets.
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

  //Yoga is a fetch handler, not an express one. The cast is the documented
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
