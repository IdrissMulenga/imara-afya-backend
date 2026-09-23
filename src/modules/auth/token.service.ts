import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { appError, ErrorCode } from '../../shared/errors.js';

//Signs and verifies session tokens and password-reset tokens.

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

//Signs a password-reset ticket bound to the current tokenVersion.
export const signResetToken = (userId: string, tokenVersion: number): string =>
  jwt.sign({ purpose: 'PASSWORD_RESET', v: tokenVersion }, env.JWT_SECRET, {
    algorithm: ALGORITHM,
    issuer: env.JWT_ISSUER,
    subject: userId,
    expiresIn: `${env.RESET_TOKEN_MINUTES}m`,
  });

export interface ResetClaims {
  userId: string;
  tokenVersion: number;
}

export const verifyResetToken = (token: string): ResetClaims => {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: [ALGORITHM],
      issuer: env.JWT_ISSUER,
    }) as jwt.JwtPayload;

    //Rejects anything that is not a reset token.
    if (payload.purpose !== 'PASSWORD_RESET' || !payload.sub || typeof payload.v !== 'number') {
      throw appError(ErrorCode.INVALID_RESET_TOKEN, 'That reset link is not valid.', {
        reason: 'INVALID',
      });
    }

    return { userId: payload.sub, tokenVersion: payload.v };
  } catch {
    throw appError(
      ErrorCode.INVALID_RESET_TOKEN,
      'That reset request has expired. Please start again.'
    );
  }
};

//True when the original sign-in is older than MAX_SESSION_DAYS.
export const isSessionTooOld = (origin: string): boolean => {
  const started = Date.parse(origin);
  if (Number.isNaN(started)) return true;
  return (Date.now() - started) / (24 * 60 * 60 * 1000) > env.MAX_SESSION_DAYS;
};
