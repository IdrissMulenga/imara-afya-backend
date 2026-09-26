import type { GraphQLResolveInfo } from 'graphql';
import { handleError } from './errors.js';
import { requireAuth } from './auth-guard.js';
import type { Context } from './context.js';
import type { IUser } from '../modules/user/index.js';

//Wraps a resolver so any error goes through handleError under the field's name.
export const safe =
  <Args, Result>(run: (args: Args, context: Context) => Promise<Result> | Result) =>
  async (
    _parent: unknown,
    args: Args,
    context: Context,
    info: GraphQLResolveInfo
  ): Promise<Result> => {
    try {
      return await run(args, context);
    } catch (error) {
      throw handleError(error, info.fieldName);
    }
  };

//Like safe, for resolvers that need a signed-in user: passes the user first.
export const withUser = <Args, Result>(
  run: (user: IUser, args: Args, context: Context) => Promise<Result> | Result
) => safe<Args, Result>((args, context) => run(requireAuth(context), args, context));
