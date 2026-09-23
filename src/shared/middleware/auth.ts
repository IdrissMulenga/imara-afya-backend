import type { Request } from 'express';
import { User, type IUser } from '../../modules/user/user.model.js';
import { verifyToken } from '../../modules/auth/token.service.js';
import { appError, ErrorCode } from '../errors.js';

//Resolves the bearer token to a user. No token means no user; an invalid or
//revoked token throws.

export interface CallerIdentity {
  user?: IUser;
  sessionOrigin?: string;
}

export const getUserFromRequest = async (req: Request): Promise<CallerIdentity> => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return {};

  const token = header.slice(7).trim();
  if (!token) return {};

  const claims = verifyToken(token);
  const user = await User.findById(claims.userId);

  if (!user) {
    throw appError(ErrorCode.UNAUTHENTICATED, 'That account no longer exists.', {
      reason: 'ACCOUNT_GONE',
    });
  }

  //Rejects tokens issued before the last logout or password change.
  if (claims.tokenVersion !== user.tokenVersion) {
    throw appError(ErrorCode.TOKEN_REVOKED, 'You have been signed out. Please sign in again.');
  }

  return { user, sessionOrigin: claims.origin };
};
