import * as authService from './auth.service.js';
import { listDevices, revokeDevice } from './device.service.js';
import { isAuthPayload } from './auth.types.js';
import { requireAuth } from '../../shared/auth-guard.js';
import { appError, ErrorCode, handleError } from '../../shared/errors.js';
import type { Context } from '../../shared/context.js';
import type { IUser } from '../user/user.model.js';
import type {
  SignUpInput,
  LoginInput,
  VerifyOtpInput,
  VerifyResetOtpInput,
  ResetPasswordInput,
  ChangePasswordInput,
  LoginResult,
  AuthPayload,
} from './auth.types.js';

//AUTH RESOLVERS.
//
//Read the arguments, call the service, return. Nothing else.

export const authResolvers = {
  Query: {
    myTrustedDevices: async (_p: unknown, _a: unknown, context: Context) => {
      const caller = requireAuth(context);
      try {
        const devices = await listDevices(caller._id);
        //The app sends its own id as a header so we can mark which row is the
        //phone the user is holding.
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
    //--- creating an account and signing in ---
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

    verifyLoginOtp: async (_p: unknown, args: { email: string; input: VerifyOtpInput }) => {
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

    //--- confirming the email address ---
    verifyEmailOtp: async (_p: unknown, args: { input: VerifyOtpInput }, context: Context) => {
      const caller = requireAuth(context);
      try {
        return await authService.verifyEmailOtp(String(caller._id), args.input.code);
      } catch (error) {
        throw handleError(error, 'verifyEmailOtp');
      }
    },

    resendEmailOtp: async (_p: unknown, _a: unknown, context: Context) => {
      const caller = requireAuth(context);
      try {
        return await authService.resendEmailOtp(String(caller._id), context.ip);
      } catch (error) {
        throw handleError(error, 'resendEmailOtp');
      }
    },

    //--- resetting a forgotten password ---
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

    //--- managing the session ---
    changePassword: async (_p: unknown, args: { input: ChangePasswordInput }, context: Context) => {
      const caller = requireAuth(context);
      try {
        return await authService.changePassword(String(caller._id), args.input);
      } catch (error) {
        throw handleError(error, 'changePassword');
      }
    },

    refreshSession: async (_p: unknown, _a: unknown, context: Context) => {
      const caller = requireAuth(context);
      try {
        //The app sends back the origin it was given, so we know when the
        //password was actually last typed.
        const origin = context.req.get('x-session-origin') ?? new Date().toISOString();
        return await authService.refreshSession(String(caller._id), origin);
      } catch (error) {
        throw handleError(error, 'refreshSession');
      }
    },

    logout: async (_p: unknown, _a: unknown, context: Context) => {
      const caller = requireAuth(context);
      try {
        return await authService.logout(String(caller._id));
      } catch (error) {
        throw handleError(error, 'logout');
      }
    },

    revokeTrustedDevice: async (_p: unknown, args: { id: string }, context: Context) => {
      const caller = requireAuth(context);
      try {
        await revokeDevice(caller._id, args.id);
        return true;
      } catch (error) {
        throw handleError(error, 'revokeTrustedDevice');
      }
    },
  },

  //THE UNION RESOLVER.
  //
  //GraphQL cannot tell on its own which member of LoginResult it received.
  //This tells it. WITHOUT THIS, EVERY LOGIN FAILS AT RUNTIME — and it is easy
  //to miss because it does not sit under Query or Mutation.
  LoginResult: {
    __resolveType: (value: LoginResult) => (isAuthPayload(value) ? 'AuthPayload' : 'OtpChallenge'),
  },

  AuthPayload: {
    user: (payload: AuthPayload): IUser => payload.user,
  },

  OtpChallenge: {
    expiresAt: (challenge: { expiresAt: Date }) => challenge.expiresAt.toISOString(),
  },
};
