import type { Request } from 'express';
import { User } from './models/user.model.js';
import { verifySessionToken } from './services/token.service.js';
import type { AuthenticatedUser } from '../../core/context.js';
import { AppError } from '../../core/errors/AppError.js';
import { ErrorCode } from '../../core/errors/codes.js';

//WHO IS CALLING.
//
//Runs on every request that carries a bearer token. A request without one is
//not an error here — plenty of fields are public — it simply produces no user,
//and the resolver guards refuse anything that needs one.
//
//An INVALID token is different from an absent one and does throw, because
//silently treating a revoked token as "not signed in" would show the user a
//login screen with no explanation of why they were signed out.

export const authenticate = async (
  request: Request
): Promise<{ user?: AuthenticatedUser; token?: string }> => {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) return {};

  const token = header.slice(7).trim();
  if (!token) return {};

  const claims = verifySessionToken(token);

  const user = await User.findById(claims.sub).select(
    'email emailVerified timezone role tokenVersion'
  );

  if (!user) {
    throw new AppError(ErrorCode.UNAUTHENTICATED, 'That account no longer exists.');
  }

  //THE REVOCATION CHECK.
  //
  //A token minted before the last logout, password change or reset carries an
  //older `v`. One comparison retires all of them at once, with no denylist to
  //store and no cache to invalidate.
  if (claims.v !== user.tokenVersion) {
    throw new AppError(
      ErrorCode.TOKEN_REVOKED,
      'You have been signed out. Please sign in again.'
    );
  }

  return {
    token,
    user: {
      id: String(user._id),
      _id: user._id,
      email: user.email,
      emailVerified: user.emailVerified,
      timezone: user.timezone,
      role: user.role,
    },
  };
};
