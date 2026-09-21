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

const number = (key: string, fallback: number): number => {
  const raw = process.env[key];
  if (!raw || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw appError(ErrorCode.CONFIG_ERROR, `${key} must be a number, got: ${raw}`);
  }
  return parsed;
};

const NODE_ENV = optional('NODE_ENV', 'development');

export const env = {
  NODE_ENV,
  IS_PRODUCTION: NODE_ENV === 'production',
  PORT: number('PORT', 4000),

  MONGODB_URI: required('MONGODB_URI'),
  DB_POOL_SIZE: number('DB_POOL_SIZE', 10),

  JWT_SECRET: required('JWT_SECRET'),
  JWT_ISSUER: optional('JWT_ISSUER', 'imara-afya'),
  SESSION_DAYS: number('SESSION_DAYS', 7),
  MAX_SESSION_DAYS: number('MAX_SESSION_DAYS', 30),
  RESET_TOKEN_MINUTES: number('RESET_TOKEN_MINUTES', 15),

  OTP_TTL_MINUTES: number('OTP_TTL_MINUTES', 10),
  OTP_MAX_ATTEMPTS: number('OTP_MAX_ATTEMPTS', 5),
  OTP_RESEND_COOLDOWN_SECONDS: number('OTP_RESEND_COOLDOWN_SECONDS', 60),
  OTP_RESENDS_PER_HOUR: number('OTP_RESENDS_PER_HOUR', 3),
  DEVICE_TRUST_DAYS: number('DEVICE_TRUST_DAYS', 90),
  MAX_PASSWORD_ATTEMPTS: number('MAX_PASSWORD_ATTEMPTS', 5),

  //Empty allows ANY origin. Fine for the Expo app (it sends no Origin header),
  //wrong once a web build exists.
  FRONTEND_URL: optional('FRONTEND_URL'),
  RATE_LIMIT_WINDOW_MS: number('RATE_LIMIT_WINDOW_MS', 60_000),
  RATE_LIMIT_MAX: number('RATE_LIMIT_MAX', 120),
  MAX_QUERY_DEPTH: number('MAX_QUERY_DEPTH', 10),

  RESEND_API_KEY: optional('RESEND_API_KEY'),
  MAIL_FROM: optional('MAIL_FROM', 'onboarding@resend.dev'),
  MAIL_REPLY_TO: optional('MAIL_REPLY_TO'),
} as const;

//Configurations that work but should not reach production. Warned at boot
//rather than thrown, because each is legitimate in development.
export const envWarnings = (): string[] => {
  const warnings: string[] = [];
  if (!env.FRONTEND_URL) warnings.push('FRONTEND_URL is unset — CORS allows ANY origin.');
  if (!env.RESEND_API_KEY) warnings.push('RESEND_API_KEY is unset — codes are logged, not emailed.');
  if (env.MAIL_FROM.endsWith('@resend.dev')) {
    warnings.push('MAIL_FROM is the Resend test sender — mail reaches only your own address.');
  }
  return warnings;
};
