import express, { type Express, type Request, type Response, type RequestHandler } from 'express';
import cors from 'cors';
import { createYoga } from 'graphql-yoga';
import { env } from './config/env.js';
import { isDBReady } from './config/db.js';
import { schema } from './graphql/schema.js';
import { getUserFromRequest } from './middleware/auth.js';
import { securityHeaders, securityPlugin } from './middleware/security.js';
import { ipRateLimit, operationLimitPlugin } from './middleware/rateLimit.js';
import type { Context } from './types/index.js';

//THE EXPRESS APP.
//
//Order of the pipeline, and why each step is where it is:
//
//  1. security headers
//  2. CORS
//  3. body size cap        — a 50MB JSON body should not reach the parser
//  4. /health              — ABOVE the rate limiter on purpose, see below
//  5. per-IP rate limit
//  6. graphql-yoga
//       depth limit + introspection control
//       per-operation rate limit
//       context (who is calling)
//       resolvers

export const createApp = (): Express => {
  const app = express();

  //`req.ip` is only trustworthy when express knows how many proxies sit in
  //front. Both rate limiters key on it — reading x-forwarded-for directly
  //would let any caller get a fresh budget by changing one header.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(securityHeaders);

  app.use(
    cors({
      origin: env.FRONTEND_URL ? env.FRONTEND_URL.split(',').map((o) => o.trim()) : true,
      credentials: true,
      //The app sends its device id and session origin as headers rather than
      //as arguments on every single operation.
      allowedHeaders: ['Content-Type', 'Authorization', 'x-device-id', 'x-session-origin'],
    })
  );

  app.use(express.json({ limit: '1mb' }));

  //Says whether this instance can actually serve, not just that the process is
  //alive. A container that is up but cannot reach Mongo should be replaced,
  //not sent traffic.
  //
  //IT SITS ABOVE THE RATE LIMITER because an uptime monitor polling every ten
  //seconds would otherwise use up the IP budget and report an outage it caused.
  app.get('/health', (_req, res) => {
    const ready = isDBReady();
    res.status(ready ? 200 : 503).json({
      status: ready ? 'ok' : 'degraded',
      database: ready ? 'connected' : 'disconnected',
      uptimeSeconds: Math.floor(process.uptime()),
    });
  });

  app.use('/graphql', ipRateLimit);

  //The generic tells yoga what express passes it on every request, which is
  //what makes `req` below properly typed instead of `any`.
  const yoga = createYoga<{ req: Request; res: Response }, Context>({
    schema,
    graphqlEndpoint: '/graphql',
    graphiql: !env.IS_PRODUCTION,
    //Yoga hides unexpected errors by default. Ours already carry proper codes
    //from utils/errors.ts, so masking again would replace them with a generic
    //one and the app would lose the ability to branch.
    maskedErrors: false,
    landingPage: false,
    plugins: [securityPlugin, operationLimitPlugin],

    //Runs once per request, before any resolver.
    context: async ({ req }): Promise<Context> => ({
      user: await getUserFromRequest(req),
      ip: req.ip ?? 'unknown',
      req,
    }),
  });

  //Yoga is a fetch handler, not an express one. The cast is the documented way
  //to mount it.
  app.use('/graphql', yoga as unknown as RequestHandler);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  return app;
};
