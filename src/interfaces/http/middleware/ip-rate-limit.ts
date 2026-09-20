import type { Request, Response, NextFunction } from 'express';
import { env } from '../../../infrastructure/config/env.js';
import { hit, bucketKey } from '../../../infrastructure/rate-limit/bucket-store.js';
import { ErrorCode } from '../../../domain/shared/errors/error-codes.js';

//THE PER-IP CAP ON THE HTTP ENDPOINT.
//
//For GraphQL this is a blunt instrument — every operation arrives at the same
//URL, so `login` and `logWater` spend from one budget. It is a backstop; the
//real limits are per-field in operation-limit.plugin.ts.

export const ipRateLimit = (req: Request, res: Response, next: NextFunction): void => {
  const key = bucketKey('ip', req.ip ?? 'unknown');
  const result = hit(key, env.RATE_LIMIT_WINDOW_MS, env.RATE_LIMIT_MAX);

  if (!result.allowed) {
    res.setHeader('Retry-After', String(result.retryAfterSeconds));
    res.status(429).json({
      errors: [
        {
          message: 'Too many requests. Please slow down.',
          extensions: { code: ErrorCode.RATE_LIMITED },
        },
      ],
    });
    return;
  }

  next();
};
