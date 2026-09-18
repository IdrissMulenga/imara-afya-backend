//ERROR CODES.
//
//The mobile app branches on `extensions.code`, never on the message text —
//messages are translated and rewritten, codes are a contract. Adding a case
//means adding a code here first; reusing a vague one because it is close
//enough is how the app ends up unable to tell two situations apart.
//
//Every code in this file is documented in AUTH_DESIGN.md section 13.

export const ErrorCode = {
  //--- account ---
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  INVALID_EMAIL: 'INVALID_EMAIL',
  WEAK_PASSWORD: 'WEAK_PASSWORD',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  ACCOUNT_NOT_FOUND: 'ACCOUNT_NOT_FOUND',

  //--- one-time codes ---
  OTP_NOT_FOUND: 'OTP_NOT_FOUND',
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_INCORRECT: 'OTP_INCORRECT',
  OTP_ATTEMPTS_EXCEEDED: 'OTP_ATTEMPTS_EXCEEDED',
  OTP_COOLDOWN: 'OTP_COOLDOWN',
  OTP_RESEND_LIMIT: 'OTP_RESEND_LIMIT',
  OTP_SEND_FAILED: 'OTP_SEND_FAILED',

  //--- passwords and sessions ---
  INVALID_RESET_TOKEN: 'INVALID_RESET_TOKEN',
  WRONG_PASSWORD: 'WRONG_PASSWORD',
  PASSWORD_ATTEMPTS_EXCEEDED: 'PASSWORD_ATTEMPTS_EXCEEDED',
  PASSWORD_UNCHANGED: 'PASSWORD_UNCHANGED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  TOKEN_REVOKED: 'TOKEN_REVOKED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',

  //--- devices ---
  DEVICE_NOT_FOUND: 'DEVICE_NOT_FOUND',
  INVALID_DEVICE_ID: 'INVALID_DEVICE_ID',

  //--- generic ---
  BAD_USER_INPUT: 'BAD_USER_INPUT',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];
