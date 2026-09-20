import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { DomainError } from '../../domain/shared/errors/domain.error.js';
import { ErrorCode } from '../../domain/shared/errors/error-codes.js';
import type { TokenService, SessionClaims } from '../../application/auth/ports/token.port.js';

//THE TOKEN PORT, IMPLEMENTED WITH JWT.
//
//Algorithm and issuer are pinned on BOTH sign and verify. Verifying without
//pinning the algorithm is what lets an attacker hand back a token signed with
//`none` and have it accepted.

const ALGORITHM = 'HS256';
const RESET_PURPOSE = 'PASSWORD_RESET';

export const jwtTokenService: TokenService = {
  signSession: (userId, tokenVersion, origin) =>
    jwt.sign({ v: tokenVersion, o: origin.toISOString() }, env.JWT_SECRET, {
      algorithm: ALGORITHM,
      issuer: env.JWT_ISSUER,
      subject: userId,
      expiresIn: `${env.SESSION_DAYS}d`,
    }),

  verifySession: (token): SessionClaims => {
    try {
      const payload = jwt.verify(token, env.JWT_SECRET, {
        algorithms: [ALGORITHM],
        issuer: env.JWT_ISSUER,
      }) as jwt.JwtPayload;

      if (!payload.sub || typeof payload.v !== 'number' || typeof payload.o !== 'string') {
        throw new DomainError(ErrorCode.UNAUTHENTICATED, 'Your session is not valid.');
      }

      return { userId: payload.sub, tokenVersion: payload.v, origin: payload.o };
    } catch (error) {
      if (error instanceof DomainError) throw error;
      if (error instanceof jwt.TokenExpiredError) {
        throw new DomainError(
          ErrorCode.SESSION_EXPIRED,
          'Your session has expired. Please sign in.'
        );
      }
      throw new DomainError(ErrorCode.UNAUTHENTICATED, 'Your session is not valid.');
    }
  },

  signReset: (userId) =>
    jwt.sign({ purpose: RESET_PURPOSE }, env.JWT_SECRET, {
      algorithm: ALGORITHM,
      issuer: env.JWT_ISSUER,
      subject: userId,
      expiresIn: `${env.RESET_TOKEN_MINUTES}m`,
    }),

  verifyReset: (token) => {
    try {
      const payload = jwt.verify(token, env.JWT_SECRET, {
        algorithms: [ALGORITHM],
        issuer: env.JWT_ISSUER,
      }) as jwt.JwtPayload;

      //THE CLAIM CHECK IS THE WHOLE POINT OF A SEPARATE TOKEN KIND.
      //
      //Without it, any valid session token would be accepted as permission to
      //set a new password without knowing the old one.
      if (payload.purpose !== RESET_PURPOSE || !payload.sub) {
        throw new DomainError(ErrorCode.INVALID_RESET_TOKEN, 'That reset link is not valid.');
      }

      return { userId: payload.sub };
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError(
        ErrorCode.INVALID_RESET_TOKEN,
        'That reset request has expired. Please start again.'
      );
    }
  },

  isOriginExpired: (origin, now) => {
    const started = Date.parse(origin);
    if (Number.isNaN(started)) return true;
    const ageDays = (now.getTime() - started) / (24 * 60 * 60 * 1000);
    return ageDays > env.MAX_SESSION_DAYS;
  },
};
