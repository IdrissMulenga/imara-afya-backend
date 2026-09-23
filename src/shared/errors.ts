import { GraphQLError } from 'graphql';

//Error codes returned in extensions.code.

export const ErrorCode = {
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  INVALID_EMAIL: 'INVALID_EMAIL',
  WEAK_PASSWORD: 'WEAK_PASSWORD',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  ACCOUNT_NOT_FOUND: 'ACCOUNT_NOT_FOUND',

  OTP_NOT_FOUND: 'OTP_NOT_FOUND',
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_INCORRECT: 'OTP_INCORRECT',
  OTP_ATTEMPTS_EXCEEDED: 'OTP_ATTEMPTS_EXCEEDED',
  OTP_COOLDOWN: 'OTP_COOLDOWN',
  OTP_RESEND_LIMIT: 'OTP_RESEND_LIMIT',
  OTP_SEND_FAILED: 'OTP_SEND_FAILED',

  INVALID_RESET_TOKEN: 'INVALID_RESET_TOKEN',
  WRONG_PASSWORD: 'WRONG_PASSWORD',
  PASSWORD_ATTEMPTS_EXCEEDED: 'PASSWORD_ATTEMPTS_EXCEEDED',
  PASSWORD_UNCHANGED: 'PASSWORD_UNCHANGED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  TOKEN_REVOKED: 'TOKEN_REVOKED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',

  DEVICE_NOT_FOUND: 'DEVICE_NOT_FOUND',
  INVALID_DEVICE_ID: 'INVALID_DEVICE_ID',

  //Startup configuration errors.
  CONFIG_ERROR: 'CONFIG_ERROR',

  BAD_USER_INPUT: 'BAD_USER_INPUT',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

//Creates a GraphQL error with a code.
export const appError = (
  code: ErrorCodeValue,
  message: string,
  extra?: Record<string, unknown>
): GraphQLError => new GraphQLError(message, { extensions: { code, ...extra } });

//Passes coded errors through; logs anything else and returns a generic INTERNAL error.
export const handleError = (error: unknown, operation: string): GraphQLError => {
  if (error instanceof GraphQLError) return error;

  //Duplicate key: the email is already registered.
  if (typeof error === 'object' && error !== null && 'code' in error) {
    if ((error as { code: number }).code === 11000) {
      return appError(ErrorCode.EMAIL_TAKEN, 'That email address is already registered.');
    }
  }

  console.error(`[error] ${operation}:`, error);
  return appError(ErrorCode.INTERNAL, 'Something went wrong. Please try again.');
};
