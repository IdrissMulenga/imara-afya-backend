import jwt from 'jsonwebtoken';
import { env } from '../../../config/env.js';
import { AppError } from '../../../core/errors/AppError.js';
import { ErrorCode } from '../../../core/errors/codes.js';

//TOKENS.
//
//Two kinds, deliberately not interchangeable.
//
//A SESSION token authenticates every request. It carries `v`, the user's
//tokenVersion at issue time, and `o`, the moment the password was actually
//typed. `v` is the revocation switch; `o` is what stops a session being
//renewed forever without the password ever being entered again.
//
//A RESET token exists only between proving a one-time code and setting the new
//password. It carries an explicit `purpose` claim that is checked on the way
//in, so a session token cannot be passed where a reset token is expected, or
//the other way round.
//
//Algorithm and issuer are pinned on BOTH sign and verify. Verifying without
//pinning the algorithm is what allows an attacker to hand back a token signed
//with `none` and have it accepted.

const ALGORITHM = 'HS256';

export interface SessionClaims {
  sub: string;
  //tokenVersion at issue
  v: number;
  //session origin, ISO string — when the password was last typed
  o: string;
}

interface ResetClaims {
  sub: string;
  purpose: 'PASSWORD_RESET';
}

export const signSessionToken = (
  userId: string,
  tokenVersion: number,
  origin: Date = new Date()
): string =>
  jwt.sign({ v: tokenVersion, o: origin.toISOString() }, env.JWT_SECRET, {
    algorithm: ALGORITHM,
    issuer: env.JWT_ISSUER,
    subject: userId,
    expiresIn: `${env.SESSION_DAYS}d`,
  });

export const verifySessionToken = (token: string): SessionClaims => {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: [ALGORITHM],
      issuer: env.JWT_ISSUER,
    }) as jwt.JwtPayload;

    if (!payload.sub || typeof payload.v !== 'number' || typeof payload.o !== 'string') {
      throw new AppError(ErrorCode.UNAUTHENTICATED, 'Your session is not valid.');
    }

    return { sub: payload.sub, v: payload.v, o: payload.o };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError(ErrorCode.SESSION_EXPIRED, 'Your session has expired. Please sign in.');
    }
    throw new AppError(ErrorCode.UNAUTHENTICATED, 'Your session is not valid.');
  }
};

export const signResetToken = (userId: string): string =>
  jwt.sign({ purpose: 'PASSWORD_RESET' }, env.JWT_SECRET, {
    algorithm: ALGORITHM,
    issuer: env.JWT_ISSUER,
    subject: userId,
    expiresIn: `${env.RESET_TOKEN_MINUTES}m`,
  });

export const verifyResetToken = (token: string): ResetClaims => {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: [ALGORITHM],
      issuer: env.JWT_ISSUER,
    }) as jwt.JwtPayload;

    //The claim check is the whole point of a separate token kind. Without it,
    //any valid session token would be accepted as permission to set a new
    //password without knowing the old one.
    if (payload.purpose !== 'PASSWORD_RESET' || !payload.sub) {
      throw new AppError(ErrorCode.INVALID_RESET_TOKEN, 'That reset link is not valid.');
    }

    return { sub: payload.sub, purpose: 'PASSWORD_RESET' };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      ErrorCode.INVALID_RESET_TOKEN,
      'That reset request has expired. Please start again.'
    );
  }
};

//THE 30-DAY CAP.
//
//Enforced on renewal only. An already-issued token keeps working until its own
//7-day expiry — a refresh cap is not a logout, it is a refusal to extend.
export const sessionOriginExpired = (origin: string, now = new Date()): boolean => {
  const started = Date.parse(origin);
  if (Number.isNaN(started)) return true;
  const ageDays = (now.getTime() - started) / (24 * 60 * 60 * 1000);
  return ageDays > env.MAX_SESSION_DAYS;
};
