import type { Request, Response, NextFunction } from 'express';
import { env } from '../../config/env.js';

//SECURITY HEADERS.
//
//Hand-rolled rather than pulling in helmet: this is a JSON API with no browser
//UI of its own, so only a handful of headers actually apply. Add helmet if a
//web dashboard is ever served from this same process.

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
