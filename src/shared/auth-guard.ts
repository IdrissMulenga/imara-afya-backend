import { appError, ErrorCode } from './errors.js';
import type { Context } from './context.js';
import type { IUser } from '../modules/user/index.js';

//Returns the user or throws UNAUTHENTICATED.
export const requireUser = (user: IUser | undefined): IUser => {
  if (!user) throw appError(ErrorCode.UNAUTHENTICATED, 'You need to be signed in.');
  return user;
};

//Returns the signed-in user, or throws why the token was rejected, or UNAUTHENTICATED.
export const requireAuth = (context: Context): IUser => {
  if (!context.user && context.authError) throw context.authError;
  return requireUser(context.user);
};
