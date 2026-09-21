import { GraphQLError } from 'graphql';

//ERRORS.
//
//The app branches on `code`, never on the message text — messages get
//translated and reworded, codes stay put. Adding a case means adding a code
//here first.

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

  BAD_USER_INPUT: 'BAD_USER_INPUT',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

//Throw this anywhere. GraphQL understands it directly, so there is no
//conversion step to remember.
export const appError = (
  code: ErrorCodeValue,
  message: string,
  extra?: Record<string, unknown>
): GraphQLError => new GraphQLError(message, { extensions: { code, ...extra } });

//Wraps a resolver so an unexpected error is logged with its stack and the
//caller gets a generic message. A raw stack trace in an API response is a free
//map of the codebase for whoever is probing it.
export const handleError = (error: unknown, operation: string): GraphQLError => {
  if (error instanceof GraphQLError) return error;

  //A unique index rejected the write. On users that is always the email index,
  //which two simultaneous signups can genuinely hit.
  if (typeof error === 'object' && error !== null && 'code' in error) {
    if ((error as { code: number }).code === 11000) {
      return appError(ErrorCode.EMAIL_TAKEN, 'That email address is already registered.');
    }
  }

  console.error(`[error] ${operation}:`, error);
  return appError(ErrorCode.INTERNAL, 'Something went wrong. Please try again.');
};
