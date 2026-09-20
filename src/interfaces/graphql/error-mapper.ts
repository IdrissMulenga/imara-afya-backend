import { GraphQLError } from 'graphql';
import mongoose from 'mongoose';
import { isDomainError } from '../../domain/shared/errors/domain.error.js';
import { ErrorCode } from '../../domain/shared/errors/error-codes.js';
import { logger } from '../../infrastructure/logging/logger.js';

//THE SINGLE PLACE A DOMAIN ERROR BECOMES A GRAPHQL RESPONSE.
//
//This is the outermost edge. Inner layers throw DomainError and know nothing
//about transports; everything crosses back here, so there is one place to
//audit for leaked internals.

const MONGO_DUPLICATE = 11000;

export const toGraphQLError = (error: unknown, operation: string): GraphQLError => {
  if (isDomainError(error)) {
    return new GraphQLError(error.expose ? error.message : 'Something went wrong.', {
      extensions: { code: error.code, ...(error.meta ?? {}) },
    });
  }

  //A GraphQLError thrown deliberately upstream (rate limiting in a plugin) is
  //already shaped correctly.
  if (error instanceof GraphQLError) return error;

  //Mongoose validation: the schema caught something a value object should
  //have. Worth logging, because it means a domain rule is missing.
  if (error instanceof mongoose.Error.ValidationError) {
    logger.warn('Schema validation caught an input the domain did not', {
      operation,
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

  //A unique index rejected the write. For users that is always the email
  //index, which is a race two simultaneous signups can genuinely hit.
  if (typeof error === 'object' && error !== null && 'code' in error) {
    if ((error as { code: number }).code === MONGO_DUPLICATE) {
      return new GraphQLError('That email address is already registered.', {
        extensions: { code: ErrorCode.EMAIL_TAKEN },
      });
    }
  }

  //Anything else is a bug. Log it with its stack and tell the caller nothing.
  logger.error('Unhandled error', {
    operation,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });

  return new GraphQLError('Something went wrong. Please try again.', {
    extensions: { code: ErrorCode.INTERNAL },
  });
};
