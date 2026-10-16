import * as userService from './user.service.js';
import { emailMyData } from './export.service.js';
import { withUser } from '../../shared/resolve.js';
import { calculateBMI } from '../../shared/numbers.js';
import type { IUser } from './user.model.js';
import type { UpdateProfileInput, PreferencesInput, DeleteAccountInput } from './user.types.js';

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

    deleteAccount: withUser((user, args: { input: DeleteAccountInput }) =>
      userService.deleteAccount(user, args.input)
    ),

    emailMyData: withUser((user) => emailMyData(user)),
  },

  User: {
    id: (user: IUser) => String(user._id),
    birthDate: (user: IUser) => user.birthDate?.toISOString() ?? null,
    createdAt: (user: IUser) => user.createdAt.toISOString(),
    bmi: (user: IUser) => calculateBMI(user.heightCm, user.weightKg),
    hasPassword: (user: IUser) => Boolean(user.passwordHash),
    signInMethods: (user: IUser) => [
      ...(user.passwordHash ? ['PASSWORD'] : []),
      ...[...new Set(user.identities.map((identity) => identity.provider.toUpperCase()))],
    ],
  },
};
