import type { Request, Response, NextFunction } from 'express';
import type { Plugin } from 'graphql-yoga';
import { createHash } from 'node:crypto';
import { GraphQLError, getOperationAST, Kind } from 'graphql';
import { env } from '../../config/env.js';
import { ErrorCode } from '../errors.js';
import type { Context } from '../context.js';

//RATE LIMITING.
//
//Counters live in memory. That is deliberate for now: no Redis to run, no
//extra cost, and one instance is all the traffic needs.
//
//TWO KNOWN LIMITS: the counts reset when the process restarts, and they are
//NOT shared between instances. The moment you run a second instance, swap the
//Map below for Redis — `hit()` keeps its shape and nothing that calls it
//changes.

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

//Drop expired buckets so the Map cannot grow forever. `unref` so this timer
//never holds the process open during shutdown.
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 5 * 60 * 1000);
sweeper.unref();

const hit = (key: string, windowMs: number, max: number) => {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  bucket.count += 1;

  if (bucket.count > max) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }

  return { allowed: true, retryAfterSeconds: 0 };
};

//Keys containing an email are hashed, so the in-memory map never holds a
//plaintext address.
const key = (...parts: string[]): string =>
  createHash('sha256').update(parts.join(':')).digest('hex').slice(0, 32);

//PER-IP CAP ON THE HTTP ENDPOINT.
//
//Blunt for GraphQL — every operation arrives at the same URL, so login and a
//dashboard read share one budget. It is a backstop; the real limits are
//per-field below.
export const ipRateLimit = (req: Request, res: Response, next: NextFunction): void => {
  const result = hit(key('ip', req.ip ?? 'unknown'), env.RATE_LIMIT_WINDOW_MS, env.RATE_LIMIT_MAX);

  if (!result.allowed) {
    res.setHeader('Retry-After', String(result.retryAfterSeconds));
    res.status(429).json({
      errors: [{ message: 'Too many requests. Please slow down.', extensions: { code: ErrorCode.RATE_LIMITED } }],
    });
    return;
  }

  next();
};

//PER-OPERATION LIMITS.
//
//An operation can have two windows: a short burst window stops a stuck retry
//loop hammering us in seconds, and a longer one caps sustained abuse. Both
//must pass.
//
//`keyBy: 'email'` matters. An attacker walking a list of addresses has no user
//id and can rotate IPs — only keying on the target address caps the attempts
//per account.
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

type Rule = {
  budgets: { windowMs: number; max: number }[];
  keyBy: 'user' | 'ip' | 'ip+email';
};

//Anything not listed here falls through to the defaults below. CHECK THIS
//TABLE before assuming a new mutation is unlimited.
const RULES: Record<string, Rule> = {
  signup: { keyBy: 'ip', budgets: [{ windowMs: 10 * MINUTE, max: 3 }, { windowMs: DAY, max: 10 }] },
  login: { keyBy: 'ip+email', budgets: [{ windowMs: MINUTE, max: 5 }, { windowMs: HOUR, max: 30 }] },

  verifyEmailOtp: { keyBy: 'user', budgets: [{ windowMs: MINUTE, max: 5 }, { windowMs: HOUR, max: 20 }] },
  verifyLoginOtp: { keyBy: 'ip+email', budgets: [{ windowMs: MINUTE, max: 5 }, { windowMs: HOUR, max: 20 }] },
  verifyPasswordResetOtp: { keyBy: 'ip+email', budgets: [{ windowMs: MINUTE, max: 5 }, { windowMs: HOUR, max: 20 }] },

  resendEmailOtp: { keyBy: 'user', budgets: [{ windowMs: MINUTE, max: 1 }, { windowMs: HOUR, max: 3 }] },
  resendLoginOtp: { keyBy: 'ip+email', budgets: [{ windowMs: MINUTE, max: 1 }, { windowMs: HOUR, max: 3 }] },
  requestPasswordReset: { keyBy: 'ip+email', budgets: [{ windowMs: MINUTE, max: 1 }, { windowMs: HOUR, max: 3 }] },
  resendPasswordResetOtp: { keyBy: 'ip+email', budgets: [{ windowMs: MINUTE, max: 1 }, { windowMs: HOUR, max: 3 }] },

  resetPassword: { keyBy: 'ip', budgets: [{ windowMs: 10 * MINUTE, max: 5 }, { windowMs: HOUR, max: 10 }] },
  changePassword: { keyBy: 'user', budgets: [{ windowMs: 10 * MINUTE, max: 5 }, { windowMs: HOUR, max: 20 }] },
  deleteAccount: { keyBy: 'user', budgets: [{ windowMs: HOUR, max: 5 }] },
};

const DEFAULT_READ: Rule = { keyBy: 'user', budgets: [{ windowMs: MINUTE, max: 120 }] };
const DEFAULT_WRITE: Rule = { keyBy: 'user', budgets: [{ windowMs: MINUTE, max: 60 }] };

//Pulls the email out of the arguments so a budget can be tied to it. Only
//literal values are readable here; a caller using variables falls back to the
//IP key, which still applies.
const emailFromArgs = (args: readonly unknown[]): string | undefined => {
  for (const argument of args as { name?: { value: string }; value?: { kind?: string; value?: string } }[]) {
    if (argument.name?.value !== 'email') continue;
    if (argument.value?.kind === Kind.STRING && argument.value.value) {
      return argument.value.value.trim().toLowerCase();
    }
  }
  return undefined;
};

export const operationLimitPlugin: Plugin<Context> = {
  onExecute({ args, setResultAndStopExecution }) {
    const context = args.contextValue;
    const operation = getOperationAST(args.document, args.operationName ?? undefined);
    if (!operation) return;

    const isMutation = operation.operation === 'mutation';

    for (const selection of operation.selectionSet.selections) {
      if (selection.kind !== Kind.FIELD) continue;

      const field = selection.name.value;
      const rule = RULES[field] ?? (isMutation ? DEFAULT_WRITE : DEFAULT_READ);
      const email = emailFromArgs(selection.arguments ?? []);
      const userId = context.user ? String(context.user._id) : undefined;

      //Falls back to IP whenever there is no user, so an unauthenticated
      //caller is never unlimited.
      const identity =
        rule.keyBy === 'user'
          ? (userId ? `user:${userId}` : `ip:${context.ip}`)
          : rule.keyBy === 'ip+email'
            ? (email ? `ip:${context.ip}|email:${email}` : `ip:${context.ip}`)
            : `ip:${context.ip}`;

      for (const budget of rule.budgets) {
        const result = hit(key('op', field, String(budget.windowMs), identity), budget.windowMs, budget.max);

        if (!result.allowed) {
          setResultAndStopExecution({
            data: null,
            errors: [
              new GraphQLError('Too many attempts. Please wait a moment and try again.', {
                extensions: { code: ErrorCode.RATE_LIMITED, retryAfterSeconds: result.retryAfterSeconds },
              }),
            ],
          });
          return;
        }
      }
    }
  },
};
