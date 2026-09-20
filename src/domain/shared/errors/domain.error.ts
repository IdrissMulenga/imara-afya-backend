import { ErrorCode, type ErrorCodeValue } from './error-codes.js';

//THE ONLY ERROR TYPE THE INNER LAYERS THROW.
//
//Domain and application code throws DomainError. It imports nothing — no
//GraphQL, no express, no mongoose — which is what lets a use case be driven
//from a test, a script or a queue worker without a transport in sight.
//
//The interfaces layer is the only place that turns one of these into a
//transport-shaped response.
//
//`expose` marks a message safe to show a user. Anything unexposed becomes a
//generic message at the edge, because an internal message is a free hint to
//whoever is probing the API.

export class DomainError extends Error {
  public readonly code: ErrorCodeValue;
  public readonly expose: boolean;
  public readonly meta?: Record<string, unknown>;

  constructor(
    code: ErrorCodeValue,
    message: string,
    options: { expose?: boolean; meta?: Record<string, unknown> } = {}
  ) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.expose = options.expose ?? true;
    this.meta = options.meta;
    Error.captureStackTrace?.(this, DomainError);
  }
}

export const isDomainError = (error: unknown): error is DomainError =>
  error instanceof DomainError;

export const invalidInput = (message: string, code: ErrorCodeValue = ErrorCode.BAD_USER_INPUT) =>
  new DomainError(code, message);

export const unauthenticated = (message = 'You need to be signed in.') =>
  new DomainError(ErrorCode.UNAUTHENTICATED, message);

export const forbidden = (message = 'You do not have access to this.') =>
  new DomainError(ErrorCode.FORBIDDEN, message);
