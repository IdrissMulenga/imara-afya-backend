import type { Request } from 'express';
import { User, type IUser } from '../../modules/user/index.js';
import { verifyToken } from '../../modules/auth/index.js';
import { appError, ErrorCode } from '../errors.js';

export interface CallerIdentity {
  user?: IUser;
  sessionOrigin?: string;
}

//Resolves the bearer token to a user; no token means no user, a bad or revoked one throws.
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
