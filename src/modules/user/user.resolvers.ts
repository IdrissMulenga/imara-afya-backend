import * as userService from './user.service.js';
import { requireAuth } from '../../shared/auth-guard.js';
import { handleError } from '../../shared/errors.js';
import type { IUser } from './user.model.js';
import type { Context } from '../../shared/context.js';
import type { UpdateProfileInput, PreferencesInput } from './user.types.js';

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

    deleteAccount: async (_p: unknown, args: { input: { password: string } }, context: Context) => {
      const caller = requireAuth(context);
      try {
        return await userService.deleteAccount(String(caller._id), args.input.password);
      } catch (error) {
        throw handleError(error, 'deleteAccount');
      }
    },
  },

  User: {
    id: (user: IUser) => String(user._id),
    birthDate: (user: IUser) => user.birthDate?.toISOString() ?? null,
    createdAt: (user: IUser) => user.createdAt.toISOString(),
    bmi: (user: IUser) => userService.calculateBMI(user.heightCm, user.weightKg),
  },
};
