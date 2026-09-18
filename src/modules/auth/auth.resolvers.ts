import { open, authed } from '../../core/resolver.js';
import * as auth from './auth.service.js';
import { deleteAccount } from './services/account.service.js';
import { listDevices, revokeDevice } from './services/device.service.js';
import { User, type UserDocument } from './models/user.model.js';
import { AppError } from '../../core/errors/AppError.js';
import { ErrorCode } from '../../core/errors/codes.js';
import { assertTimezone, cleanText } from '../../shared/utils/validation.js';

//RESOLVERS.
//
//Thin by design. Each one unwraps arguments, calls a service, and returns.
//No business logic, no try/catch — `open` and `authed` supply the guard and
//the error conversion, so a resolver that forgets either cannot be written.

type Args<T> = { input: T };

const isSession = (result: unknown): result is auth.SessionResult =>
  typeof result === 'object' && result !== null && 'token' in result;

export const resolvers = {
  Query: {
    me: authed('me', async (_args: unknown, context) => {
      const user = await User.findById(context.user.id);
      if (!user) throw new AppError(ErrorCode.ACCOUNT_NOT_FOUND, 'That account no longer exists.');
      return user;
    }),

    myTrustedDevices: authed('myTrustedDevices', async (_args: unknown, context) => {
      const devices = await listDevices(context.user._id);
      const currentId = context.request.get('x-device-id');
      return devices.map((device) => ({
        id: String(device._id),
        label: device.label,
        lastSeenAt: device.lastSeenAt.toISOString(),
        expiresAt: device.expiresAt.toISOString(),
        current: Boolean(currentId) && device.deviceId === currentId,
      }));
    }),
  },

  Mutation: {
    //--- account creation and sign-in ---
    signup: open('signup', (args: Args<{
      email: string;
      password: string;
      deviceId: string;
      deviceLabel?: string;
    }>, context) => auth.signup({ ...args.input, ip: context.ip })),

    login: open('login', (args: Args<{
      email: string;
      password: string;
      deviceId: string;
      deviceLabel?: string;
    }>, context) => auth.login({ ...args.input, ip: context.ip })),

    verifyLoginOtp: open('verifyLoginOtp', (
      args: { email: string; input: { code: string; deviceId?: string; deviceLabel?: string } }
    ) => {
      if (!args.input.deviceId) {
        throw new AppError(
          ErrorCode.INVALID_DEVICE_ID,
          'This request is missing its device identifier.'
        );
      }
      return auth.verifyLoginOtp({
        email: args.email,
        code: args.input.code,
        deviceId: args.input.deviceId,
        deviceLabel: args.input.deviceLabel,
      });
    }),

    resendLoginOtp: open('resendLoginOtp', (
      args: { email: string; deviceId: string },
      context
    ) => auth.resendLoginOtp({ ...args, ip: context.ip })),

    //--- email verification ---
    verifyEmailOtp: authed('verifyEmailOtp', (args: Args<{ code: string }>, context) =>
      auth.verifyEmailOtp({ userId: context.user.id, code: args.input.code })
    ),

    resendEmailOtp: authed('resendEmailOtp', (_args: unknown, context) =>
      auth.resendEmailOtp({ userId: context.user.id, ip: context.ip })
    ),

    //--- password reset ---
    requestPasswordReset: open('requestPasswordReset', (
      args: { email: string },
      context
    ) => auth.requestPasswordReset({ email: args.email, ip: context.ip })),

    verifyPasswordResetOtp: open('verifyPasswordResetOtp', async (
      args: Args<{ email: string; code: string }>
    ) => {
      const ticket = await auth.verifyPasswordResetOtp(args.input);
      return { resetToken: ticket.resetToken, expiresAt: ticket.expiresAt.toISOString() };
    }),

    resendPasswordResetOtp: open('resendPasswordResetOtp', (
      args: { email: string },
      context
    ) => auth.requestPasswordReset({ email: args.email, ip: context.ip })),

    resetPassword: open('resetPassword', (args: Args<{
      resetToken: string;
      password: string;
      deviceId: string;
      deviceLabel?: string;
    }>) => auth.resetPassword(args.input)),

    //--- session management ---
    changePassword: authed('changePassword', (
      args: Args<{ currentPassword: string; newPassword: string }>,
      context
    ) => auth.changePassword({ userId: context.user.id, ...args.input })),

    refreshSession: authed('refreshSession', (_args: unknown, context) =>
      auth.refreshSession({
        userId: context.user.id,
        origin: context.request.get('x-session-origin') ?? new Date().toISOString(),
      })
    ),

    logout: authed('logout', (_args: unknown, context) => auth.logout(context.user.id)),

    revokeTrustedDevice: authed('revokeTrustedDevice', async (
      args: { id: string },
      context
    ) => {
      await revokeDevice(context.user._id, args.id);
      return true;
    }),

    //--- profile ---
    updateProfile: authed('updateProfile', async (args: Args<{
      name?: string;
      photoUrl?: string;
      gender?: 'female' | 'male' | 'unspecified';
      birthDate?: string;
      heightCm?: number;
      weightKg?: number;
    }>, context) => {
      const user = await User.findById(context.user.id);
      if (!user) throw new AppError(ErrorCode.ACCOUNT_NOT_FOUND, 'That account no longer exists.');

      const { input } = args;
      if (input.name !== undefined) user.name = cleanText(input.name, 80, 'Name');
      if (input.photoUrl !== undefined) user.photoUrl = input.photoUrl.trim();
      if (input.gender !== undefined) user.gender = input.gender;
      if (input.heightCm !== undefined) user.heightCm = input.heightCm;
      if (input.weightKg !== undefined) user.weightKg = input.weightKg;

      if (input.birthDate !== undefined) {
        const parsed = new Date(input.birthDate);
        if (Number.isNaN(parsed.getTime()) || parsed > new Date()) {
          throw new AppError(ErrorCode.BAD_USER_INPUT, 'That date of birth is not valid.');
        }
        user.birthDate = parsed;
      }

      await user.save();
      return user;
    }),

    setPreferences: authed('setPreferences', async (args: Args<{
      language?: 'en' | 'fr' | 'sw' | 'rn';
      units?: 'metric' | 'imperial';
      timezone?: string;
      cycleTrackingEnabled?: boolean;
      waterGoalGlasses?: number;
      stepGoal?: number;
      sleepGoalHours?: number;
    }>, context) => {
      const user = await User.findById(context.user.id);
      if (!user) throw new AppError(ErrorCode.ACCOUNT_NOT_FOUND, 'That account no longer exists.');

      const { input } = args;
      if (input.language !== undefined) user.language = input.language;
      if (input.units !== undefined) user.units = input.units;
      if (input.timezone !== undefined) user.timezone = assertTimezone(input.timezone);
      if (input.cycleTrackingEnabled !== undefined) {
        user.cycleTrackingEnabled = input.cycleTrackingEnabled;
      }
      if (input.waterGoalGlasses !== undefined) user.waterGoalGlasses = input.waterGoalGlasses;
      if (input.stepGoal !== undefined) user.stepGoal = input.stepGoal;
      if (input.sleepGoalHours !== undefined) user.sleepGoalHours = input.sleepGoalHours;

      await user.save();
      return user;
    }),

    deleteAccount: authed('deleteAccount', (
      args: Args<{ password: string }>,
      context
    ) => deleteAccount({ userId: context.user.id, password: args.input.password })),
  },

  //TYPE-LEVEL RESOLVERS.
  //
  //The union needs a __resolveType or every login response fails at runtime.
  //The old barrel pattern spread only Query and Mutation, so this is exactly
  //the case that used to break silently — core/module.ts has a `types` key
  //specifically so it cannot.
  types: {
    LoginResult: {
      __resolveType: (value: unknown) => (isSession(value) ? 'AuthPayload' : 'OtpChallenge'),
    },

    User: {
      id: (user: UserDocument) => String(user._id),
      birthDate: (user: UserDocument) => user.birthDate?.toISOString() ?? null,
      createdAt: (user: UserDocument) => user.createdAt.toISOString(),

      //Derived, never stored. A stored BMI goes stale the moment a weight is
      //logged, and then two numbers in the app disagree.
      bmi: (user: UserDocument) => {
        if (!user.heightCm || !user.weightKg) return null;
        const metres = user.heightCm / 100;
        return Math.round((user.weightKg / (metres * metres)) * 10) / 10;
      },
    },

    AuthPayload: {
      user: (payload: { user: UserDocument }) => payload.user,
    },

    OtpChallenge: {
      expiresAt: (challenge: { expiresAt: Date }) => challenge.expiresAt.toISOString(),
    },
  },
};
