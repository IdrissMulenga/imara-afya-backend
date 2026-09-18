import { ErrorCode, type ErrorCodeValue } from './codes.js';

//DOMAIN ERRORS THAT KNOW NOTHING ABOUT GRAPHQL.
//
//Services throw `AppError`. Only the resolver layer converts it into a
//`GraphQLError`. That separation is what lets a service be called from a
//script, a queue worker or a REST handler later without dragging the GraphQL
//runtime along with it.
//
//`expose` marks an error whose message is safe to show a user. Anything that
//is not exposed becomes a generic message on the way out, because an internal
//message is a free hint to whoever is probing the API.

export class AppError extends Error {
  public readonly code: ErrorCodeValue;
  public readonly expose: boolean;
  public readonly meta?: Record<string, unknown>;

  constructor(
    code: ErrorCodeValue,
    message: string,
    options: { expose?: boolean; meta?: Record<string, unknown> } = {}
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.expose = options.expose ?? true;
    this.meta = options.meta;
    Error.captureStackTrace?.(this, AppError);
  }
}

//Shorthands for the cases that recur. They read better at the throw site than
//`new AppError(ErrorCode.X, '...')` and they keep the code/message pairing in
//one place instead of drifting apart across twenty resolvers.
export const badInput = (message: string, code: ErrorCodeValue = ErrorCode.BAD_USER_INPUT) =>
  new AppError(code, message);

export const unauthenticated = (message = 'You need to be signed in.') =>
  new AppError(ErrorCode.UNAUTHENTICATED, message);

export const forbidden = (message = 'You do not have access to this.') =>
  new AppError(ErrorCode.FORBIDDEN, message);

export const notFound = (message = 'Not found.', code: ErrorCodeValue = ErrorCode.NOT_FOUND) =>
  new AppError(code, message);

export const internal = (message = 'Something went wrong.') =>
  new AppError(ErrorCode.INTERNAL, message, { expose: false });

export const isAppError = (error: unknown): error is AppError => error instanceof AppError;
