import type { Context, AuthenticatedUser } from './context.js';
import { toGraphQLError } from './errors/toGraphQLError.js';
import { AppError } from './errors/AppError.js';
import { ErrorCode } from './errors/codes.js';

//RESOLVER WRAPPERS.
//
//The old codebase asked every resolver to open with an auth check and close
//with a `rethrow` in a catch block. Two lines of ceremony per resolver, about
//fifty resolvers, and the failure mode of forgetting either one was silent:
//a missing guard meant an unauthenticated read, a missing rethrow meant a raw
//stack trace in the API response.
//
//Here the wrapper IS the guard. `authed(fn)` cannot run `fn` without a user,
//and cannot let an unconverted error escape. A resolver that forgets to be
//wrapped does not compile into the schema builder's expected shape.

type Resolver<TArgs, TResult> = (
  parent: unknown,
  args: TArgs,
  context: Context
) => Promise<TResult> | TResult;

type AuthedResolver<TArgs, TResult> = (
  args: TArgs,
  context: Context & { user: AuthenticatedUser }
) => Promise<TResult> | TResult;

type PublicResolver<TArgs, TResult> = (
  args: TArgs,
  context: Context
) => Promise<TResult> | TResult;

//PUBLIC: no session required. Signup, login, password reset.
export const open = <TArgs, TResult>(
  name: string,
  fn: PublicResolver<TArgs, TResult>
): Resolver<TArgs, TResult> => {
  return async (_parent, args, context) => {
    try {
      return await fn(args, context);
    } catch (error) {
      throw toGraphQLError(error, name);
    }
  };
};

//AUTHENTICATED: a valid, non-revoked session token.
export const authed = <TArgs, TResult>(
  name: string,
  fn: AuthedResolver<TArgs, TResult>
): Resolver<TArgs, TResult> => {
  return async (_parent, args, context) => {
    try {
      if (!context.user) {
        throw new AppError(ErrorCode.UNAUTHENTICATED, 'You need to be signed in.');
      }
      return await fn(args, context as Context & { user: AuthenticatedUser });
    } catch (error) {
      throw toGraphQLError(error, name);
    }
  };
};

//VERIFIED: authenticated AND the email address has been proven.
//
//Used sparingly. Tracking data must stay writable before verification — a user
//who cannot log a glass of water on day one does not come back on day two.
//This guard is for things where an unproven address is the actual risk.
export const verified = <TArgs, TResult>(
  name: string,
  fn: AuthedResolver<TArgs, TResult>
): Resolver<TArgs, TResult> => {
  return authed(name, (args, context) => {
    if (!context.user.emailVerified) {
      throw new AppError(
        ErrorCode.EMAIL_NOT_VERIFIED,
        'Please confirm your email address first.'
      );
    }
    return fn(args, context);
  });
};

//ADMIN: for publishing shared content. Not reachable by any app screen.
export const adminOnly = <TArgs, TResult>(
  name: string,
  fn: AuthedResolver<TArgs, TResult>
): Resolver<TArgs, TResult> => {
  return authed(name, (args, context) => {
    if (context.user.role !== 'admin') {
      throw new AppError(ErrorCode.FORBIDDEN, 'You do not have access to this.');
    }
    return fn(args, context);
  });
};
