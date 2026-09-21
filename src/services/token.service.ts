import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { appError, ErrorCode } from '../utils/errors.js';

//TOKENS.
//
//Two kinds, deliberately not interchangeable.
//
//SESSION token — authenticates every request. Carries `v` (the user's
//tokenVersion when it was signed) and `o` (when the password was last typed).
//
//RESET token — only exists between proving a code and setting a new password.
//It carries purpose: 'PASSWORD_RESET', which is checked on the way back in, so
//a session token cannot be used to change a password without the old one.
//
//`algorithms: ['HS256']` on verify is not optional. Without it, an attacker
//can hand back a token signed with "none" and have it accepted.

const ALGORITHM = 'HS256';

export interface SessionClaims {
  userId: string;
  tokenVersion: number;
  origin: string;
}

export const signToken = (userId: string, tokenVersion: number, origin = new Date()): string =>
  jwt.sign({ v: tokenVersion, o: origin.toISOString() }, env.JWT_SECRET, {
    algorithm: ALGORITHM,
    issuer: env.JWT_ISSUER,
    subject: userId,
    expiresIn: `${env.SESSION_DAYS}d`,
  });

export const verifyToken = (token: string): SessionClaims => {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: [ALGORITHM],
      issuer: env.JWT_ISSUER,
    }) as jwt.JwtPayload;

    if (!payload.sub || typeof payload.v !== 'number' || typeof payload.o !== 'string') {
      throw appError(ErrorCode.UNAUTHENTICATED, 'Your session is not valid.');
    }

    return { userId: payload.sub, tokenVersion: payload.v, origin: payload.o };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw appError(ErrorCode.SESSION_EXPIRED, 'Your session has expired. Please sign in.');
    }
    throw appError(ErrorCode.UNAUTHENTICATED, 'Your session is not valid.');
  }
};

export const signResetToken = (userId: string): string =>
  jwt.sign({ purpose: 'PASSWORD_RESET' }, env.JWT_SECRET, {
    algorithm: ALGORITHM,
    issuer: env.JWT_ISSUER,
    subject: userId,
    expiresIn: `${env.RESET_TOKEN_MINUTES}m`,
  });

export const verifyResetToken = (token: string): string => {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: [ALGORITHM],
      issuer: env.JWT_ISSUER,
    }) as jwt.JwtPayload;

    //THIS CHECK IS THE WHOLE REASON RESET TOKENS ARE SEPARATE. Without it any
    //valid session token would be permission to set a new password.
    if (payload.purpose !== 'PASSWORD_RESET' || !payload.sub) {
      throw appError(ErrorCode.INVALID_RESET_TOKEN, 'That reset link is not valid.');
    }

    return payload.sub;
  } catch {
    throw appError(ErrorCode.INVALID_RESET_TOKEN, 'That reset request has expired. Please start again.');
  }
};

//Enforced on refresh only. It stops a session being renewed forever — an
//already-issued token still works until its own 7-day expiry, so this is a
//refusal to extend, not a logout.
export const isSessionTooOld = (origin: string): boolean => {
  const started = Date.parse(origin);
  if (Number.isNaN(started)) return true;
  return (Date.now() - started) / (24 * 60 * 60 * 1000) > env.MAX_SESSION_DAYS;
};
