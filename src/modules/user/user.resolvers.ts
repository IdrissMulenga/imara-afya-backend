import * as userService from './user.service.js';
import { requireAuth } from '../../shared/auth-guard.js';
import { handleError } from '../../shared/errors.js';
import type { IUser } from './user.model.js';
import type { Context } from '../../shared/context.js';
import type { UpdateProfileInput, PreferencesInput } from './user.types.js';

//USER RESOLVERS.
//
//Each one: check the caller is signed in, call the service, return. No logic
//here — if you are writing an `if` about a rule, it belongs in the service.

export const userResolvers = {
  Query: {
    me: async (_p: unknown, _a: unknown, context: Context) => {
      const caller = requireAuth(context);
      try {
        return await userService.getUser(String(caller._id));
      } catch (error) {
        throw handleError(error, 'me');
      }
    },
  },

  Mutation: {
    updateProfile: async (_p: unknown, args: { input: UpdateProfileInput }, context: Context) => {
      const caller = requireAuth(context);
      try {
        return await userService.updateProfile(String(caller._id), args.input);
      } catch (error) {
        throw handleError(error, 'updateProfile');
      }
    },

    setPreferences: async (_p: unknown, args: { input: PreferencesInput }, context: Context) => {
      const caller = requireAuth(context);
      try {
        return await userService.setPreferences(String(caller._id), args.input);
      } catch (error) {
        throw handleError(error, 'setPreferences');
      }
    },

    deleteAccount: async (
      _p: unknown,
      args: { input: { password: string } },
      context: Context
    ) => {
      const caller = requireAuth(context);
      try {
        return await userService.deleteAccount(String(caller._id), args.input.password);
      } catch (error) {
        throw handleError(error, 'deleteAccount');
      }
    },
  },

  //FIELD RESOLVERS — only for fields not stored exactly as the app needs them.
  User: {
    //_id is an ObjectId; GraphQL wants a string.
    id: (user: IUser) => String(user._id),
    birthDate: (user: IUser) => user.birthDate?.toISOString() ?? null,
    createdAt: (user: IUser) => user.createdAt.toISOString(),
    //Worked out on the way out, so it can never disagree with the weight the
    //user just logged.
    bmi: (user: IUser) => userService.calculateBMI(user.heightCm, user.weightKg),
  },
};
