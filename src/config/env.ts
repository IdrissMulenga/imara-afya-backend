import 'dotenv/config';
import { appError, ErrorCode } from '../shared/errors.js';

const required = (key: string): string => {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    throw appError(ErrorCode.CONFIG_ERROR, `Missing required environment variable: ${key}`);
  }
  return value.trim();
};

const optional = (key: string, fallback = ''): string => (process.env[key] ?? fallback).trim();

//Reads a numeric variable, rejecting values below min.
const number = (key: string, fallback: number, min = 1): number => {
  const raw = process.env[key];
  if (!raw || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw appError(ErrorCode.CONFIG_ERROR, `${key} must be a number, got: ${raw}`);
  }
  if (parsed < min) {
    throw appError(ErrorCode.CONFIG_ERROR, `${key} must be at least ${min}, got: ${parsed}`);
  }
  return parsed;
};

//Minimum JWT secret length.
const JWT_SECRET_MIN = 32;

const secret = (key: string): string => {
  const value = required(key);
  if (value.length < JWT_SECRET_MIN) {
    throw appError(
      ErrorCode.CONFIG_ERROR,
      `${key} must be at least ${JWT_SECRET_MIN} characters (got ${value.length}). ` +
        'Generate one with: openssl rand -base64 48'
    );
  }
  return value;
};

//True when the database runs on this computer (the local MongoDB seen in Compass).
export const isLocalDatabase = (uri: string): boolean =>
  /^mongodb:\/\/([^@/]*@)?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|\?|$)/i.test(uri);

const NODE_ENV = optional('NODE_ENV', 'development');

export const env = {
  NODE_ENV,
  IS_PRODUCTION: NODE_ENV === 'production',
  PORT: number('PORT', 4000),

  MONGODB_URI: required('MONGODB_URI'),
  DB_POOL_SIZE: number('DB_POOL_SIZE', 10),

  JWT_SECRET: secret('JWT_SECRET'),
  JWT_ISSUER: optional('JWT_ISSUER', 'imara-afya'),
  SESSION_DAYS: number('SESSION_DAYS', 30),
  MAX_SESSION_DAYS: number('MAX_SESSION_DAYS', 365),
  RESET_TOKEN_MINUTES: number('RESET_TOKEN_MINUTES', 15),

  OTP_TTL_MINUTES: number('OTP_TTL_MINUTES', 10),
  OTP_MAX_ATTEMPTS: number('OTP_MAX_ATTEMPTS', 5),
  OTP_RESEND_COOLDOWN_SECONDS: number('OTP_RESEND_COOLDOWN_SECONDS', 60),
  OTP_RESENDS_PER_HOUR: number('OTP_RESENDS_PER_HOUR', 3),
  DEVICE_TRUST_DAYS: number('DEVICE_TRUST_DAYS', 90),

  //Avatar storage directory, relative to the working directory.
  UPLOAD_DIR: optional('UPLOAD_DIR', 'uploads'),
  MAX_UPLOAD_MB: number('MAX_UPLOAD_MB', 10),
  MAX_PASSWORD_ATTEMPTS: number('MAX_PASSWORD_ATTEMPTS', 5),

  //Empty allows any origin.
  FRONTEND_URL: optional('FRONTEND_URL'),
  RATE_LIMIT_WINDOW_MS: number('RATE_LIMIT_WINDOW_MS', 60_000),
  //Requests per IP per window.
  RATE_LIMIT_MAX: number('RATE_LIMIT_MAX', 600),
  MAX_QUERY_DEPTH: number('MAX_QUERY_DEPTH', 10),

  RESEND_API_KEY: optional('RESEND_API_KEY'),
  MAIL_FROM: optional('MAIL_FROM', 'onboarding@resend.dev'),
  MAIL_REPLY_TO: optional('MAIL_REPLY_TO'),

  //Development only: every code goes to this address. Ignored in production.
  MAIL_DEV_TO: optional('MAIL_DEV_TO'),
} as const;

//Settings required in production.
if (env.IS_PRODUCTION) {
  if (isLocalDatabase(env.MONGODB_URI)) {
    throw appError(
      ErrorCode.CONFIG_ERROR,
      'MONGODB_URI points at a local database in production — set it to the MongoDB Atlas connection string.'
    );
  }
  if (!env.FRONTEND_URL) {
    throw appError(
      ErrorCode.CONFIG_ERROR,
      'FRONTEND_URL must be set in production — leaving it empty allows requests from ANY origin.'
    );
  }
  if (!env.RESEND_API_KEY) {
    throw appError(
      ErrorCode.CONFIG_ERROR,
      'RESEND_API_KEY must be set in production — without it no user can receive a code.'
    );
  }
}

//Settings that are allowed but probably wrong, printed at startup.
export const envWarnings = (): string[] => {
  const warnings: string[] = [];
  if (!env.IS_PRODUCTION && !isLocalDatabase(env.MONGODB_URI)) {
    warnings.push(
      'MONGODB_URI is a remote database (Atlas) in development — test data goes to the real database.'
    );
  }
  if (!env.FRONTEND_URL) warnings.push('FRONTEND_URL is unset — CORS allows ANY origin.');
  if (!env.RESEND_API_KEY)
    warnings.push('RESEND_API_KEY is unset — codes are logged, not emailed.');
  if (env.MAIL_FROM.endsWith('@resend.dev')) {
    warnings.push(
      'MAIL_FROM is the Resend test sender — mail reaches ONLY your own Resend address. ' +
        'Signup and new-device login work for nobody else until a domain is verified.'
    );
  }
  if (env.MAIL_DEV_TO) {
    warnings.push(
      `MAIL_DEV_TO is set — EVERY code goes to ${env.MAIL_DEV_TO}, not to the account it is for.`
    );
  }
  return warnings;
};
