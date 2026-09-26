import type { Request, Response, NextFunction } from 'express';
import type { Plugin } from 'graphql-yoga';
import { createHash } from 'node:crypto';
import {
  GraphQLError,
  getOperationAST,
  Kind,
  type ArgumentNode,
  type DocumentNode,
  type FieldNode,
  type FragmentDefinitionNode,
  type SelectionSetNode,
  type ValueNode,
} from 'graphql';
import { env } from '../../config/env.js';
import { ErrorCode } from '../errors.js';
import { sendError } from '../http.js';
import type { Context } from '../context.js';

//In-memory rate-limit counters (per process).
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

const sweeper = setInterval(
  () => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  },
  5 * 60 * 1000
);
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
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  return { allowed: true, retryAfterSeconds: 0 };
};

//Hashed bucket key.
const key = (...parts: string[]): string =>
  createHash('sha256').update(parts.join(':')).digest('hex').slice(0, 32);

//Per-IP rate-limit middleware; each scope has its own bucket.
export const ipRateLimitFor =
  (scope: string) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = hit(
      key(scope, req.ip ?? 'unknown'),
      env.RATE_LIMIT_WINDOW_MS,
      env.RATE_LIMIT_MAX
    );

    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.retryAfterSeconds));
      sendError(
        req,
        res,
        429,
        { code: ErrorCode.RATE_LIMITED, retryAfterSeconds: result.retryAfterSeconds },
        'Too many requests. Please slow down.'
      );
      return;
    }

    next();
  };

export const ipRateLimit = ipRateLimitFor('ip');

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

//Limit multiplier outside production.
const RELAX = env.IS_PRODUCTION ? 1 : 20;

type Budget = { windowMs: number; max: number };
type Rule = {
  budgets: Budget[];
  keyBy: 'user' | 'ip' | 'ip+email';
};

//Sending a code: one a minute, three an hour.
const CODE_SENDS: Budget[] = [
  { windowMs: MINUTE, max: 1 },
  { windowMs: HOUR, max: 3 },
];
//Checking a code: five a minute, twenty an hour.
const CODE_CHECKS: Budget[] = [
  { windowMs: MINUTE, max: 5 },
  { windowMs: HOUR, max: 20 },
];

//Per-operation limits; every budget must pass. Unlisted fields use
//DEFAULT_READ / DEFAULT_WRITE.
const RULES: Record<string, Rule> = {
  signup: {
    keyBy: 'ip',
    budgets: [
      { windowMs: 10 * MINUTE, max: 20 },
      { windowMs: DAY, max: 200 },
    ],
  },
  login: {
    keyBy: 'ip+email',
    budgets: [
      { windowMs: MINUTE, max: 5 },
      { windowMs: HOUR, max: 30 },
    ],
  },

  verifyEmailOtp: { keyBy: 'user', budgets: CODE_CHECKS },
  verifyLoginOtp: { keyBy: 'ip+email', budgets: CODE_CHECKS },
  verifyPasswordResetOtp: { keyBy: 'ip+email', budgets: CODE_CHECKS },

  resendEmailOtp: { keyBy: 'user', budgets: CODE_SENDS },
  resendLoginOtp: { keyBy: 'ip+email', budgets: CODE_SENDS },
  requestPasswordReset: { keyBy: 'ip+email', budgets: CODE_SENDS },
  resendPasswordResetOtp: { keyBy: 'ip+email', budgets: CODE_SENDS },

  resetPassword: {
    keyBy: 'ip',
    budgets: [
      { windowMs: 10 * MINUTE, max: 20 },
      { windowMs: HOUR, max: 60 },
    ],
  },
  changePassword: {
    keyBy: 'user',
    budgets: [
      { windowMs: 10 * MINUTE, max: 5 },
      { windowMs: HOUR, max: 20 },
    ],
  },
  deleteAccount: { keyBy: 'user', budgets: [{ windowMs: HOUR, max: 5 }] },
};

const DEFAULT_READ: Rule = { keyBy: 'user', budgets: [{ windowMs: MINUTE, max: 120 }] };
const DEFAULT_WRITE: Rule = { keyBy: 'user', budgets: [{ windowMs: MINUTE, max: 60 }] };

const asEmail = (candidate: unknown): string | undefined =>
  typeof candidate === 'string' && candidate.trim() ? candidate.trim().toLowerCase() : undefined;

const readEmail = (
  value: ValueNode | undefined,
  variables: Record<string, unknown>
): string | undefined => {
  if (!value) return undefined;

  switch (value.kind) {
    case Kind.STRING:
      return asEmail(value.value);

    case Kind.VARIABLE: {
      const supplied = variables[value.name.value];
      return asEmail(supplied) ?? asEmail((supplied as { email?: unknown } | null)?.email);
    }

    case Kind.OBJECT: {
      for (const field of value.fields) {
        if (field.name.value === 'email') return readEmail(field.value, variables);
      }
      return undefined;
    }

    default:
      return undefined;
  }
};

//Reads the target email from an operation's arguments (literal, variable or input object).
const emailFromArgs = (
  args: readonly ArgumentNode[],
  variables: Record<string, unknown>
): string | undefined => {
  for (const argument of args) {
    if (argument.name.value !== 'email' && argument.name.value !== 'input') continue;
    const found = readEmail(argument.value, variables);
    if (found) return found;
  }
  return undefined;
};

//The operation's top-level fields, including those inside fragments and inline fragments.
const topLevelFields = (
  set: SelectionSetNode,
  document: DocumentNode,
  seen = new Set<string>()
): FieldNode[] =>
  set.selections.flatMap((selection) => {
    if (selection.kind === Kind.FIELD) return [selection];
    if (selection.kind === Kind.INLINE_FRAGMENT) {
      return topLevelFields(selection.selectionSet, document, seen);
    }
    const name = selection.name.value;
    if (seen.has(name)) return [];
    seen.add(name);
    const fragment = document.definitions.find(
      (d): d is FragmentDefinitionNode =>
        d.kind === Kind.FRAGMENT_DEFINITION && d.name.value === name
    );
    return fragment ? topLevelFields(fragment.selectionSet, document, seen) : [];
  });

export const operationLimitPlugin: Plugin<Context> = {
  onExecute({ args, setResultAndStopExecution }) {
    const context = args.contextValue;
    const operation = getOperationAST(args.document, args.operationName ?? undefined);
    if (!operation) return;

    const isMutation = operation.operation === 'mutation';

    for (const selection of topLevelFields(operation.selectionSet, args.document)) {
      const field = selection.name.value;
      const rule = RULES[field] ?? (isMutation ? DEFAULT_WRITE : DEFAULT_READ);
      const email = emailFromArgs(
        selection.arguments ?? [],
        (args.variableValues ?? {}) as Record<string, unknown>
      );
      const userId = context.user ? String(context.user._id) : undefined;

      //Who the budget applies to: the user, the IP, or IP + email.
      const identity =
        rule.keyBy === 'user'
          ? userId
            ? `user:${userId}`
            : `ip:${context.ip}`
          : rule.keyBy === 'ip+email'
            ? email
              ? `ip:${context.ip}|email:${email}`
              : `ip:${context.ip}`
            : `ip:${context.ip}`;

      for (const budget of rule.budgets) {
        const result = hit(
          key('op', field, String(budget.windowMs), identity),
          budget.windowMs,
          budget.max * RELAX
        );

        if (!result.allowed) {
          setResultAndStopExecution({
            data: null,
            errors: [
              new GraphQLError('Too many attempts. Please wait a moment and try again.', {
                extensions: {
                  code: ErrorCode.RATE_LIMITED,
                  retryAfterSeconds: result.retryAfterSeconds,
                },
              }),
            ],
          });
          return;
        }
      }
    }
  },
};
