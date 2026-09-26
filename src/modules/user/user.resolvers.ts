import * as userService from './user.service.js';
import { withUser } from '../../shared/resolve.js';
import type { IUser } from './user.model.js';
import type { UpdateProfileInput, PreferencesInput } from './user.types.js';

export const userResolvers = {
  Query: {
    //The user was loaded from the token for this request.
    me: withUser((user) => user),
  },

  Mutation: {
    updateProfile: withUser((user, args: { input: UpdateProfileInput }) =>
      userService.updateProfile(user, args.input)
    ),

    setPreferences: withUser((user, args: { input: PreferencesInput }) =>
      userService.setPreferences(user, args.input)
    ),

    deleteAccount: withUser((user, args: { input: { password: string } }) =>
      userService.deleteAccount(user, args.input.password)
    ),
  },

  User: {
    id: (user: IUser) => String(user._id),
    birthDate: (user: IUser) => user.birthDate?.toISOString() ?? null,
    createdAt: (user: IUser) => user.createdAt.toISOString(),
    bmi: (user: IUser) => userService.calculateBMI(user.heightCm, user.weightKg),
  },
};
