import { appError, ErrorCode } from './errors.js';
import type { Context } from './context.js';
import type { IUser } from '../modules/user/user.model.js';

//THE FIRST LINE OF ANY RESOLVER THAT NEEDS A SIGNED-IN USER.
//
//Shared rather than copied into each module, so the error code and message
//cannot drift apart between them.
//
//Returns the user so the resolver can use it directly:
//   const caller = requireAuth(context);
export const requireAuth = (context: Context): IUser => {
  if (!context.user) throw appError(ErrorCode.UNAUTHENTICATED, 'You need to be signed in.');
  return context.user;
};
