import path from 'node:path';
import express, { type Express, type Request, type Response, type RequestHandler } from 'express';
import cors from 'cors';
import compression from 'compression';
import { createYoga } from 'graphql-yoga';
import { GraphQLError } from 'graphql';
import { appError, ErrorCode } from './shared/errors.js';
import { env } from './config/env.js';
import { isDBReady } from './config/db.js';
import { schema } from './schema.js';
import { getUserFromRequest } from './shared/middleware/auth.js';
import { securityHeaders, securityPlugin } from './shared/middleware/security.js';
import {
  requestRateLimit,
  uploadRateLimit,
  operationLimitPlugin,
} from './shared/middleware/rateLimit.js';
import { localizeErrors } from './shared/localize.js';
import { uploadRouter, avatarDir } from './modules/upload/index.js';
import type { Context } from './shared/context.js';

//Builds the express app: headers, CORS, uploads, health check, rate limits and GraphQL.
export const createApp = (): Express => {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(securityHeaders);

  //Gzips responses over 1 KB; GraphQL JSON shrinks to about a fifth, which matters on 2G/3G.
  app.use(compression({ threshold: 1024 }));

  app.use(
    cors({
      origin: env.FRONTEND_URL ? env.FRONTEND_URL.split(',').map((o) => o.trim()) : true,
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'accept-language'],
    })
  );

  app.use(express.json({ limit: '1mb' }));

  //Serves uploaded avatars.
  app.use(
    '/uploads/avatars',
    express.static(avatarDir(), {
      dotfiles: 'deny',
      index: false,
      fallthrough: false,
      maxAge: '365d',
      immutable: true,
    })
  );

  app.use('/upload', uploadRateLimit, uploadRouter());

  //Public privacy policy and terms of use pages, linked from the app and the stores (not rate limited).
  app.get('/privacy', (_req, res) => {
    res.sendFile(path.resolve(process.cwd(), 'public', 'privacy.html'));
  });

  app.get('/terms', (_req, res) => {
    res.sendFile(path.resolve(process.cwd(), 'public', 'terms.html'));
  });

  //Health check for uptime monitors (not rate limited).
  app.get('/health', (_req, res) => {
    const ready = isDBReady();
    res.status(ready ? 200 : 503).json({
      status: ready ? 'ok' : 'degraded',
      database: ready ? 'connected' : 'disconnected',
      uptimeSeconds: Math.floor(process.uptime()),
    });
  });

  app.use('/graphql', requestRateLimit);

  const yoga = createYoga<{ req: Request; res: Response }, Context>({
    schema,
    graphqlEndpoint: '/graphql',
    graphiql: !env.IS_PRODUCTION,
    maskedErrors: false,
    landingPage: false,
    plugins: [securityPlugin, operationLimitPlugin, localizeErrors],

    //Builds the per-request context: the caller, session origin and IP.
    //A rejected token leaves the caller anonymous, so login and signup still work.
    context: async ({ req }): Promise<Context> => {
      const ip = req.ip ?? 'unknown';

      try {
        const caller = await getUserFromRequest(req);
        return {
          user: caller.user,
          sessionOrigin: caller.sessionOrigin,
          sessionDeviceId: caller.sessionDeviceId,
          ip,
          req,
        };
      } catch (error) {
        if (error instanceof GraphQLError) return { authError: error, ip, req };
        console.error('[context] could not identify caller:', error);
        throw appError(ErrorCode.INTERNAL, 'Something went wrong. Please try again.');
      }
    },
  });

  app.use('/graphql', yoga as unknown as RequestHandler);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  return app;
};
