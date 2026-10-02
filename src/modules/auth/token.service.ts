import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { appError, ErrorCode } from '../../shared/errors.js';
import { daysSince } from '../../shared/datetime.js';

//Signs and verifies session tokens and password-reset tokens.

const ALGORITHM = 'HS256';

export interface SessionClaims {
  userId: string;
  tokenVersion: number;
  origin: string;
  //The device signed in with; absent on tokens issued before it was recorded.
  deviceId?: string;
}

export interface ResetClaims {
  userId: string;
  tokenVersion: number;
}

//Signs claims for a user with the pinned algorithm and issuer.
const sign = (claims: object, userId: string, expiresIn: string): string =>
  jwt.sign(claims, env.JWT_SECRET, {
    algorithm: ALGORITHM,
    issuer: env.JWT_ISSUER,
    subject: userId,
    expiresIn: expiresIn as jwt.SignOptions['expiresIn'],
  });

//Verifies a token with the pinned algorithm and issuer; throws jwt's own errors.
const decode = (token: string): jwt.JwtPayload =>
  jwt.verify(token, env.JWT_SECRET, {
    algorithms: [ALGORITHM],
    issuer: env.JWT_ISSUER,
  }) as jwt.JwtPayload;

//Signs a session token; origin is the time of the original sign-in, deviceId the device used.
export const signToken = (
  userId: string,
  tokenVersion: number,
  deviceId: string | undefined,
  origin = new Date()
): string =>
  sign(
    { v: tokenVersion, o: origin.toISOString(), ...(deviceId ? { d: deviceId } : {}) },
    userId,
    `${env.SESSION_DAYS}d`
  );

//Reads a session token, or throws SESSION_EXPIRED / UNAUTHENTICATED.
export const verifyToken = (token: string): SessionClaims => {
  try {
    const payload = decode(token);
    if (!payload.sub || typeof payload.v !== 'number' || typeof payload.o !== 'string') {
      throw appError(ErrorCode.UNAUTHENTICATED, 'Your session is not valid.');
    }
    return {
      userId: payload.sub,
      tokenVersion: payload.v,
      origin: payload.o,
      deviceId: typeof payload.d === 'string' ? payload.d : undefined,
    };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw appError(ErrorCode.SESSION_EXPIRED, 'Your session has expired. Please sign in.');
    }
    throw appError(ErrorCode.UNAUTHENTICATED, 'Your session is not valid.');
  }
};

//Signs a password-reset ticket bound to the current tokenVersion.
export const signResetToken = (userId: string, tokenVersion: number): string =>
  sign({ purpose: 'PASSWORD_RESET', v: tokenVersion }, userId, `${env.RESET_TOKEN_MINUTES}m`);

//Reads a password-reset token, or throws INVALID_RESET_TOKEN.
export const verifyResetToken = (token: string): ResetClaims => {
  let payload: jwt.JwtPayload;
  try {
    payload = decode(token);
  } catch {
    throw appError(
      ErrorCode.INVALID_RESET_TOKEN,
      'That reset request has expired. Please start again.'
    );
  }
  //Rejects anything that is not a reset token.
  if (payload.purpose !== 'PASSWORD_RESET' || !payload.sub || typeof payload.v !== 'number') {
    throw appError(ErrorCode.INVALID_RESET_TOKEN, 'That reset link is not valid.', {
      reason: 'INVALID',
    });
  }
  return { userId: payload.sub, tokenVersion: payload.v };
};

//True when the original sign-in is older than MAX_SESSION_DAYS.
export const isSessionTooOld = (origin: string): boolean => {
  const started = new Date(origin);
  return Number.isNaN(started.getTime()) || daysSince(started) > env.MAX_SESSION_DAYS;
};
