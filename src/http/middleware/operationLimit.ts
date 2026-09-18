import type { Plugin } from 'graphql-yoga';
import { GraphQLError, getOperationAST, Kind } from 'graphql';
import type { Context } from '../../core/context.js';
import { hit, bucketKey } from './rateLimit.js';

//PER-OPERATION RATE LIMITING.
//
//The IP limiter counts HTTP requests, which for GraphQL is almost meaningless:
//every operation arrives at the same URL, so `login` and `logWater` spend from
//one budget, and a single POST can carry several fields at once.
//
//This plugin counts the FIELDS actually executed, so the abusable can be
//limited on their own terms without throttling normal use.
//
//It shares the in-memory buckets in rateLimit.ts and inherits the same two
//limits: counts reset on restart and are not shared between instances.

type Budget = { windowMs: number; max: number };

//An operation may carry more than one budget. A burst window stops a stuck
//retry loop or a double-tapped button hammering us within seconds; the longer
//window is what actually caps sustained abuse. Both must pass.
type Rule = {
  budgets: Budget[];
  //Which identity the budget belongs to. `email` is the important one: an
  //unauthenticated attacker walking a list of addresses has no user id and can
  //rotate IPs, so only the target address caps the attempts per account.
  keyBy: 'user' | 'ip' | 'email' | 'ip+email';
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

//Anything not listed falls through to DEFAULT_READ or DEFAULT_WRITE.
//Before assuming a new mutation is unlimited, look here.
const RULES: Record<string, Rule> = {
  //--- account creation and sign-in ---
  signup: { keyBy: 'ip', budgets: [{ windowMs: 10 * MINUTE, max: 3 }, { windowMs: DAY, max: 10 }] },
  login: {
    keyBy: 'ip+email',
    budgets: [{ windowMs: MINUTE, max: 5 }, { windowMs: HOUR, max: 30 }],
  },

  //--- code verification: the brute-force surface ---
  verifyEmailOtp: {
    keyBy: 'user',
    budgets: [{ windowMs: MINUTE, max: 5 }, { windowMs: HOUR, max: 20 }],
  },
  verifyLoginOtp: {
    keyBy: 'ip+email',
    budgets: [{ windowMs: MINUTE, max: 5 }, { windowMs: HOUR, max: 20 }],
  },
  verifyPasswordResetOtp: {
    keyBy: 'ip+email',
    budgets: [{ windowMs: MINUTE, max: 5 }, { windowMs: HOUR, max: 20 }],
  },

  //--- resends: these cost money as well as attention ---
  resendEmailOtp: {
    keyBy: 'user',
    budgets: [{ windowMs: MINUTE, max: 1 }, { windowMs: HOUR, max: 3 }],
  },
  resendLoginOtp: {
    keyBy: 'ip+email',
    budgets: [{ windowMs: MINUTE, max: 1 }, { windowMs: HOUR, max: 3 }],
  },
  requestPasswordReset: {
    keyBy: 'ip+email',
    budgets: [{ windowMs: MINUTE, max: 1 }, { windowMs: HOUR, max: 3 }],
  },
  resendPasswordResetOtp: {
    keyBy: 'ip+email',
    budgets: [{ windowMs: MINUTE, max: 1 }, { windowMs: HOUR, max: 3 }],
  },

  //--- password changes ---
  resetPassword: {
    keyBy: 'ip',
    budgets: [{ windowMs: 10 * MINUTE, max: 5 }, { windowMs: HOUR, max: 10 }],
  },
  changePassword: {
    keyBy: 'user',
    budgets: [{ windowMs: 10 * MINUTE, max: 5 }, { windowMs: HOUR, max: 20 }],
  },
  deleteAccount: { keyBy: 'user', budgets: [{ windowMs: HOUR, max: 5 }] },
};

const DEFAULT_READ: Rule = { keyBy: 'user', budgets: [{ windowMs: MINUTE, max: 120 }] };
const DEFAULT_WRITE: Rule = { keyBy: 'user', budgets: [{ windowMs: MINUTE, max: 60 }] };

//The identity a budget is counted against. Falls back to IP whenever there is
//no user, so an unauthenticated caller is never unlimited.
const identityFor = (rule: Rule, context: Context, email?: string): string => {
  const ip = context.ip;
  const user = context.user?.id;

  switch (rule.keyBy) {
    case 'user':
      return user ? `user:${user}` : `ip:${ip}`;
    case 'email':
      return email ? `email:${email}` : `ip:${ip}`;
    case 'ip+email':
      return email ? `ip:${ip}|email:${email}` : `ip:${ip}`;
    case 'ip':
    default:
      return `ip:${ip}`;
  }
};

//Pull the target address out of the arguments so a budget can be keyed to it.
//Only literal values are readable here; a variable is resolved later, so a
//caller using variables falls back to the IP-only key. That is acceptable —
//the IP budget still applies, and the per-account cap is a second layer.
const emailFromArgs = (args: readonly unknown[]): string | undefined => {
  for (const argument of args as { name?: { value: string }; value?: unknown }[]) {
    const name = argument.name?.value;
    if (name !== 'email') continue;
    const value = argument.value as { kind?: string; value?: string };
    if (value?.kind === Kind.STRING && value.value) return value.value.trim().toLowerCase();
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

      const fieldName = selection.name.value;
      const rule = RULES[fieldName] ?? (isMutation ? DEFAULT_WRITE : DEFAULT_READ);
      const email = emailFromArgs(selection.arguments ?? []);
      const identity = identityFor(rule, context, email);

      for (const budget of rule.budgets) {
        const key = bucketKey('op', fieldName, String(budget.windowMs), identity);
        const result = hit(key, budget.windowMs, budget.max);

        if (!result.allowed) {
          setResultAndStopExecution({
            data: null,
            errors: [
              new GraphQLError('Too many attempts. Please wait a moment and try again.', {
                extensions: {
                  code: 'RATE_LIMITED',
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
