import type { Request } from 'express';
import { User, type IUser } from '../../modules/user/index.js';
import { sessionDeviceActive, verifyToken } from '../../modules/auth/index.js';
import { appError, ErrorCode } from '../errors.js';

export interface CallerIdentity {
  user?: IUser;
  sessionOrigin?: string;
  sessionDeviceId?: string;
}

//Resolves the bearer token to a user; no token means no user, a bad or revoked one throws.
export const getUserFromRequest = async (req: Request): Promise<CallerIdentity> => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return {};

  const token = header.slice(7).trim();
  if (!token) return {};

  const claims = verifyToken(token);
  const user = await User.findById(claims.userId);

  if (!user || user.deletedAt) {
    throw appError(ErrorCode.UNAUTHENTICATED, 'That account no longer exists.', {
      reason: 'ACCOUNT_GONE',
    });
  }

  //Rejects tokens issued before the last logout or password change.
  if (claims.tokenVersion !== user.tokenVersion) {
    throw appError(ErrorCode.TOKEN_REVOKED, 'You have been signed out. Please sign in again.');
  }

  //Rejects a session whose device was removed from the trusted devices. Tokens from before
  //devices were recorded carry none and are not checked.
  if (claims.deviceId && !(await sessionDeviceActive(user._id, claims.deviceId))) {
    throw appError(
      ErrorCode.TOKEN_REVOKED,
      'This phone was removed from your trusted devices. Please sign in again.',
      { reason: 'DEVICE_REMOVED' }
    );
  }

  return { user, sessionOrigin: claims.origin, sessionDeviceId: claims.deviceId };
};
