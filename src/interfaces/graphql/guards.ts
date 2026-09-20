import { DomainError } from '../../domain/shared/errors/domain.error.js';
import { ErrorCode } from '../../domain/shared/errors/error-codes.js';
import { toGraphQLError } from './error-mapper.js';
import type { GraphQLContext, AuthenticatedCaller } from './context.js';

//RESOLVER WRAPPERS.
//
//The wrapper IS the guard and the error handler. Asking every resolver to open
//with an auth check and close with a catch block is two lines of ceremony
//whose failure mode is silent both ways — a missing guard is an
//unauthenticated read, a missing catch is a stack trace in the API response.
//
//Inside `authed`, `context.caller` is non-null and TypeScript knows it.

type RawResolver<TArgs, TResult> = (
  parent: unknown,
  args: TArgs,
  context: GraphQLContext
) => Promise<TResult> | TResult;

type AuthedHandler<TArgs, TResult> = (
  args: TArgs,
  context: GraphQLContext & { caller: AuthenticatedCaller }
) => Promise<TResult> | TResult;

type PublicHandler<TArgs, TResult> = (
  args: TArgs,
  context: GraphQLContext
) => Promise<TResult> | TResult;

//PUBLIC: no session required. Signup, login, password reset.
export const open = <TArgs, TResult>(
  name: string,
  handler: PublicHandler<TArgs, TResult>
): RawResolver<TArgs, TResult> => {
  return async (_parent, args, context) => {
    try {
      return await handler(args, context);
    } catch (error) {
      throw toGraphQLError(error, name);
    }
  };
};

//AUTHENTICATED: a valid, non-revoked session token.
export const authed = <TArgs, TResult>(
  name: string,
  handler: AuthedHandler<TArgs, TResult>
): RawResolver<TArgs, TResult> => {
  return async (_parent, args, context) => {
    try {
      if (!context.caller) {
        throw new DomainError(ErrorCode.UNAUTHENTICATED, 'You need to be signed in.');
      }
      return await handler(args, context as GraphQLContext & { caller: AuthenticatedCaller });
    } catch (error) {
      throw toGraphQLError(error, name);
    }
  };
};

//VERIFIED: authenticated AND the email address has been proven.
//
//Used sparingly. Tracking data must stay writable before verification — a user
//who cannot log a glass of water on day one does not come back on day two.
export const verified = <TArgs, TResult>(
  name: string,
  handler: AuthedHandler<TArgs, TResult>
): RawResolver<TArgs, TResult> =>
  authed(name, (args, context) => {
    if (!context.caller.emailVerified) {
      throw new DomainError(
        ErrorCode.EMAIL_NOT_VERIFIED,
        'Please confirm your email address first.'
      );
    }
    return handler(args, context);
  });

//ADMIN: for publishing shared content. Not reachable by any app screen.
export const adminOnly = <TArgs, TResult>(
  name: string,
  handler: AuthedHandler<TArgs, TResult>
): RawResolver<TArgs, TResult> =>
  authed(name, (args, context) => {
    if (context.caller.role !== 'admin') {
      throw new DomainError(ErrorCode.FORBIDDEN, 'You do not have access to this.');
    }
    return handler(args, context);
  });
