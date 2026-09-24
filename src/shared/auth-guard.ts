import { appError, ErrorCode } from './errors.js';
import type { Context } from './context.js';
import type { IUser } from '../modules/user/user.model.js';

//Returns the signed-in user or throws UNAUTHENTICATED.
export const requireAuth = (context: Context): IUser => {
  if (!context.user) throw appError(ErrorCode.UNAUTHENTICATED, 'You need to be signed in.');
  return context.user;
};
