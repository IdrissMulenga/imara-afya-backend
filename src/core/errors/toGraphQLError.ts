import { GraphQLError } from 'graphql';
import mongoose from 'mongoose';
import { AppError, isAppError } from './AppError.js';
import { ErrorCode } from './codes.js';
import { logger } from '../logger.js';

//THE SINGLE PLACE AN ERROR BECOMES A GRAPHQL RESPONSE.
//
//Every resolver is wrapped by `withErrors` in core/resolver.ts, so no resolver
//needs its own try/catch or its own `rethrow` call. One conversion point means
//one place to audit for leaked internals.

const MONGO_DUPLICATE = 11000;

export const toGraphQLError = (error: unknown, context: string): GraphQLError => {
  //Already a domain error: pass the code through, mask the message if the
  //error was not marked safe to show.
  if (isAppError(error)) {
    return new GraphQLError(error.expose ? error.message : 'Something went wrong.', {
      extensions: { code: error.code, ...(error.meta ?? {}) },
    });
  }

  //A GraphQLError thrown deliberately upstream (auth in the context layer,
  //rate limiting in a plugin) is already shaped correctly.
  if (error instanceof GraphQLError) return error;

  //Mongoose validation: the schema caught something validation.ts should have.
  //Worth logging, because it means a server-side check is missing.
  if (error instanceof mongoose.Error.ValidationError) {
    logger.warn('Schema validation caught an input our validators did not', {
      context,
      fields: Object.keys(error.errors),
    });
    return new GraphQLError('Some of that information is not valid.', {
      extensions: { code: ErrorCode.BAD_USER_INPUT },
    });
  }

  if (error instanceof mongoose.Error.CastError) {
    return new GraphQLError('That identifier is not valid.', {
      extensions: { code: ErrorCode.BAD_USER_INPUT },
    });
  }

  //A unique index rejected the write. For the users collection that is always
  //the email index, which is a race two signups can genuinely hit.
  if (typeof error === 'object' && error !== null && 'code' in error) {
    if ((error as { code: number }).code === MONGO_DUPLICATE) {
      return new GraphQLError('That email address is already registered.', {
        extensions: { code: ErrorCode.EMAIL_TAKEN },
      });
    }
  }

  //Anything else is a bug. Log it with its stack and tell the caller nothing.
  logger.error('Unhandled error', {
    context,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });

  return new GraphQLError('Something went wrong. Please try again.', {
    extensions: { code: ErrorCode.INTERNAL },
  });
};

export { AppError };
