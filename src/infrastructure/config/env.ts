import 'dotenv/config';


const required = (key: string): string => {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value.trim();
};

const optional = (key: string, fallback = ''): string =>
  (process.env[key] ?? fallback).trim();

const number = (key: string, fallback: number): number => {
  const raw = process.env[key];
  if (!raw || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Environment variable ${key} must be a number, got: ${raw}`);
  }
  return parsed;
};

const boolean = (key: string, fallback = false): boolean => {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
};

const NODE_ENV = optional('NODE_ENV', 'development');
const IS_PRODUCTION = NODE_ENV === 'production';

//CORS.
//
//An empty FRONTEND_URL allows ANY origin. That is deliberate for the Expo app,
//which sends no Origin header at all, but it is the wrong default once a web
//build exists — so it is logged loudly at boot rather than passing silently.
const parseAllowedOrigins = (raw: string): string[] | '*' => {
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '*') return '*';
  return trimmed
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
};

export const env = {
  NODE_ENV,
  IS_PRODUCTION,
  IS_TEST: NODE_ENV === 'test',
  PORT: number('PORT', 4000),

  //--- database ---
  MONGODB_URI: required('MONGODB_URI'),
  DB_POOL_SIZE: number('DB_POOL_SIZE', 10),

  //--- auth ---
  JWT_SECRET: required('JWT_SECRET'),
  JWT_ISSUER: optional('JWT_ISSUER', 'imara-afya'),
  SESSION_DAYS: number('SESSION_DAYS', 7),
  MAX_SESSION_DAYS: number('MAX_SESSION_DAYS', 30),
  RESET_TOKEN_MINUTES: number('RESET_TOKEN_MINUTES', 15),

  //--- one-time codes ---
  OTP_TTL_MINUTES: number('OTP_TTL_MINUTES', 10),
  OTP_MAX_ATTEMPTS: number('OTP_MAX_ATTEMPTS', 5),
  OTP_RESEND_COOLDOWN_SECONDS: number('OTP_RESEND_COOLDOWN_SECONDS', 60),
  OTP_RESENDS_PER_HOUR: number('OTP_RESENDS_PER_HOUR', 3),
  DEVICE_TRUST_DAYS: number('DEVICE_TRUST_DAYS', 90),
  MAX_PASSWORD_ATTEMPTS: number('MAX_PASSWORD_ATTEMPTS', 5),

  //--- http ---
  ALLOWED_ORIGINS: parseAllowedOrigins(optional('FRONTEND_URL')),
  RATE_LIMIT_WINDOW_MS: number('RATE_LIMIT_WINDOW_MS', 60_000),
  RATE_LIMIT_MAX: number('RATE_LIMIT_MAX', 120),
  BODY_LIMIT: optional('BODY_LIMIT', '1mb'),

  //--- mail ---
  RESEND_API_KEY: optional('RESEND_API_KEY'),
  MAIL_FROM: optional('MAIL_FROM', 'onboarding@resend.dev'),
  MAIL_REPLY_TO: optional('MAIL_REPLY_TO'),

  //--- graphql ---
  MAX_QUERY_DEPTH: number('MAX_QUERY_DEPTH', 10),
  GRAPHIQL: boolean('GRAPHIQL', !IS_PRODUCTION),
} as const;

//BOOT-TIME WARNINGS.
//
//These are configurations that work but should not survive to production.
//They warn rather than throw, because each one is legitimate in development.
export const auditEnv = (): string[] => {
  const warnings: string[] = [];

  if (env.ALLOWED_ORIGINS === '*') {
    warnings.push('FRONTEND_URL is unset — CORS is allowing ANY origin.');
  }
  if (!env.RESEND_API_KEY) {
    warnings.push('RESEND_API_KEY is unset — one-time codes will be logged, not emailed.');
  }
  if (env.MAIL_FROM.endsWith('@resend.dev')) {
    warnings.push(
      'MAIL_FROM is the Resend shared sender — mail reaches ONLY your own Resend account address.'
    );
  }
  if (env.IS_PRODUCTION && env.JWT_SECRET.length < 32) {
    warnings.push('JWT_SECRET is shorter than 32 characters.');
  }

  return warnings;
};
