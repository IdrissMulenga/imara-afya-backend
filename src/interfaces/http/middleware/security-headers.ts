import type { Request, Response, NextFunction } from 'express';
import { env } from '../../../infrastructure/config/env.js';

export const securityHeaders = (_req: Request, res: Response, next: NextFunction): void => {
  //don't let a browser guess a response is HTML and run it
  res.setHeader('X-Content-Type-Options', 'nosniff');
  //this API is never meant to be framed
  res.setHeader('X-Frame-Options', 'DENY');
  //don't leak our URLs to third parties
  res.setHeader('Referrer-Policy', 'no-referrer');
  //nothing here should ever be cached by an intermediary — it is all personal
  res.setHeader('Cache-Control', 'no-store');
  //stop tooling advertising the stack
  res.removeHeader('X-Powered-By');

  if (env.IS_PRODUCTION) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
};
