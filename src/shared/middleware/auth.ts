import type { Request } from 'express';
import { User, type IUser } from '../../modules/user/user.model.js';
import { verifyToken } from '../../modules/auth/token.service.js';
import { appError, ErrorCode } from '../errors.js';

//WHO IS CALLING.
//
//Runs on every request that carries a token. No token is not an error — plenty
//of fields are public — it just means no user, and `requireAuth` in the
//resolvers refuses anything that needs one.
//
//An INVALID token is different and does throw, because silently treating a
//revoked token as "not signed in" would show the user a login screen with no
//explanation of why.

export interface CallerIdentity {
  user?: IUser;
  //Straight off the verified token. See shared/context.ts for why this must
  //never come from a request header.
  sessionOrigin?: string;
}

export const getUserFromRequest = async (req: Request): Promise<CallerIdentity> => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return {};

  const token = header.slice(7).trim();
  if (!token) return {};

  const claims = verifyToken(token);
  const user = await User.findById(claims.userId);

  if (!user) throw appError(ErrorCode.UNAUTHENTICATED, 'That account no longer exists.');

  //THE LOGOUT CHECK.
  //
  //A token signed before the last logout, password change or reset carries an
  //older tokenVersion. This one comparison retires all of them at once — no
  //denylist to store, no cache to clear.
  if (claims.tokenVersion !== user.tokenVersion) {
    throw appError(ErrorCode.TOKEN_REVOKED, 'You have been signed out. Please sign in again.');
  }

  return { user, sessionOrigin: claims.origin };
};
