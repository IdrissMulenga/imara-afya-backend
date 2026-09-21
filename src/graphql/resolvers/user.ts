import * as authService from '../../services/auth.service.js';
import * as userService from '../../services/user.service.js';
import { listDevices, revokeDevice } from '../../services/device.service.js';
import { appError, ErrorCode, handleError } from '../../utils/errors.js';
import { isAuthPayload } from '../../types/index.js';
import type { IUser } from '../../models/index.js';
import type {
  Context,
  SignUpInput,
  LoginInput,
  VerifyOtpInput,
  VerifyResetOtpInput,
  ResetPasswordInput,
  ChangePasswordInput,
  UpdateProfileInput,
  PreferencesInput,
  LoginResult,
  AuthPayload,
} from '../../types/index.js';

//RESOLVERS.
//
//Each one: read the arguments, call a service, return. No business logic here.
//If you find yourself writing an `if` about a rule, it belongs in the service.

//Throws unless the request carried a valid token. Call it as the first line of
//anything that needs a signed-in user.
const requireAuth = (context: Context): IUser => {
  if (!context.user) throw appError(ErrorCode.UNAUTHENTICATED, 'You need to be signed in.');
  return context.user;
};

export const userResolvers = {
  Query: {
    me: async (_p: unknown, _a: unknown, context: Context) => {
      const user = requireAuth(context);
      try {
        return await authService.getMe(String(user._id));
      } catch (error) {
        throw handleError(error, 'me');
      }
    },

    myTrustedDevices: async (_p: unknown, _a: unknown, context: Context) => {
      const user = requireAuth(context);
      try {
        const devices = await listDevices(user._id);
        //The app sends its own id as a header so we can mark which row is the
        //phone you are holding.
        const currentId = context.req.get('x-device-id');

        return devices.map((device) => ({
          id: String(device._id),
          label: device.label,
          lastSeenAt: device.lastSeenAt.toISOString(),
          expiresAt: device.expiresAt.toISOString(),
          current: Boolean(currentId) && device.deviceId === currentId,
        }));
      } catch (error) {
        throw handleError(error, 'myTrustedDevices');
      }
    },
  },

  Mutation: {
    signup: async (_p: unknown, args: { input: SignUpInput }, context: Context) => {
      try {
        return await authService.signup({ ...args.input, ip: context.ip });
      } catch (error) {
        throw handleError(error, 'signup');
      }
    },

    login: async (_p: unknown, args: { input: LoginInput }, context: Context) => {
      try {
        return await authService.login({ ...args.input, ip: context.ip });
      } catch (error) {
        throw handleError(error, 'login');
      }
    },

    verifyEmailOtp: async (_p: unknown, args: { input: VerifyOtpInput }, context: Context) => {
      const user = requireAuth(context);
      try {
        return await authService.verifyEmailOtp(String(user._id), args.input.code);
      } catch (error) {
        throw handleError(error, 'verifyEmailOtp');
      }
    },

    resendEmailOtp: async (_p: unknown, _a: unknown, context: Context) => {
      const user = requireAuth(context);
      try {
        return await authService.resendEmailOtp(String(user._id), context.ip);
      } catch (error) {
        throw handleError(error, 'resendEmailOtp');
      }
    },

    verifyLoginOtp: async (
      _p: unknown,
      args: { email: string; input: VerifyOtpInput }
    ) => {
      try {
        if (!args.input.deviceId) {
          throw appError(ErrorCode.INVALID_DEVICE_ID, 'This request is missing its device identifier.');
        }
        return await authService.verifyLoginOtp({
          email: args.email,
          code: args.input.code,
          deviceId: args.input.deviceId,
          deviceLabel: args.input.deviceLabel,
        });
      } catch (error) {
        throw handleError(error, 'verifyLoginOtp');
      }
    },

    resendLoginOtp: async (
      _p: unknown,
      args: { email: string; deviceId: string },
      context: Context
    ) => {
      try {
        return await authService.resendLoginOtp(args.email, args.deviceId, context.ip);
      } catch (error) {
        throw handleError(error, 'resendLoginOtp');
      }
    },

    requestPasswordReset: async (_p: unknown, args: { email: string }, context: Context) => {
      try {
        return await authService.requestPasswordReset(args.email, context.ip);
      } catch (error) {
        throw handleError(error, 'requestPasswordReset');
      }
    },

    //Same work as requestPasswordReset. It is a separate field so the two can
    //have separate rate-limit budgets — a first request and a resend are
    //different behaviours to a limiter.
    resendPasswordResetOtp: async (_p: unknown, args: { email: string }, context: Context) => {
      try {
        return await authService.requestPasswordReset(args.email, context.ip);
      } catch (error) {
        throw handleError(error, 'resendPasswordResetOtp');
      }
    },

    verifyPasswordResetOtp: async (_p: unknown, args: { input: VerifyResetOtpInput }) => {
      try {
        const ticket = await authService.verifyPasswordResetOtp(args.input.email, args.input.code);
        return { resetToken: ticket.resetToken, expiresAt: ticket.expiresAt.toISOString() };
      } catch (error) {
        throw handleError(error, 'verifyPasswordResetOtp');
      }
    },

    resetPassword: async (_p: unknown, args: { input: ResetPasswordInput }) => {
      try {
        return await authService.resetPassword(args.input);
      } catch (error) {
        throw handleError(error, 'resetPassword');
      }
    },

    changePassword: async (_p: unknown, args: { input: ChangePasswordInput }, context: Context) => {
      const user = requireAuth(context);
      try {
        return await authService.changePassword(String(user._id), args.input);
      } catch (error) {
        throw handleError(error, 'changePassword');
      }
    },

    refreshSession: async (_p: unknown, _a: unknown, context: Context) => {
      const user = requireAuth(context);
      try {
        //The app sends back the origin it was given, so we know when the
        //password was actually last typed.
        const origin = context.req.get('x-session-origin') ?? new Date().toISOString();
        return await authService.refreshSession(String(user._id), origin);
      } catch (error) {
        throw handleError(error, 'refreshSession');
      }
    },

    logout: async (_p: unknown, _a: unknown, context: Context) => {
      const user = requireAuth(context);
      try {
        return await authService.logout(String(user._id));
      } catch (error) {
        throw handleError(error, 'logout');
      }
    },

    revokeTrustedDevice: async (_p: unknown, args: { id: string }, context: Context) => {
      const user = requireAuth(context);
      try {
        await revokeDevice(user._id, args.id);
        return true;
      } catch (error) {
        throw handleError(error, 'revokeTrustedDevice');
      }
    },

    updateProfile: async (_p: unknown, args: { input: UpdateProfileInput }, context: Context) => {
      const user = requireAuth(context);
      try {
        return await userService.updateProfile(String(user._id), args.input);
      } catch (error) {
        throw handleError(error, 'updateProfile');
      }
    },

    setPreferences: async (_p: unknown, args: { input: PreferencesInput }, context: Context) => {
      const user = requireAuth(context);
      try {
        return await userService.setPreferences(String(user._id), args.input);
      } catch (error) {
        throw handleError(error, 'setPreferences');
      }
    },

    deleteAccount: async (_p: unknown, args: { input: { password: string } }, context: Context) => {
      const user = requireAuth(context);
      try {
        return await userService.deleteAccount(String(user._id), args.input.password);
      } catch (error) {
        throw handleError(error, 'deleteAccount');
      }
    },
  },

  //UNION RESOLVER.
  //
  //GraphQL cannot tell which member of LoginResult it received. This tells it.
  //WITHOUT THIS, EVERY LOGIN FAILS AT RUNTIME — and it is easy to forget
  //because it does not sit under Query or Mutation.
  LoginResult: {
    __resolveType: (value: LoginResult) => (isAuthPayload(value) ? 'AuthPayload' : 'OtpChallenge'),
  },

  //FIELD RESOLVERS.
  //
  //Only for fields that are not stored as-is: ids need converting from
  //ObjectId, dates to strings, and bmi is worked out on the way out.
  User: {
    id: (user: IUser) => String(user._id),
    birthDate: (user: IUser) => user.birthDate?.toISOString() ?? null,
    createdAt: (user: IUser) => user.createdAt.toISOString(),
    bmi: (user: IUser) => userService.calculateBMI(user.heightCm, user.weightKg),
  },

  AuthPayload: {
    user: (payload: AuthPayload) => payload.user,
  },

  OtpChallenge: {
    expiresAt: (challenge: { expiresAt: Date }) => challenge.expiresAt.toISOString(),
  },
};
