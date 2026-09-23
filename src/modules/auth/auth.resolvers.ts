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

export const authResolvers = {
  Query: {
    myTrustedDevices: async (_p: unknown, _a: unknown, context: Context) => {
      const caller = requireAuth(context);
      try {
        const devices = await listDevices(caller._id);
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

    verifyLoginOtp: async (_p: unknown, args: { email: string; input: VerifyOtpInput }) => {
      try {
        if (!args.input.deviceId) {
          throw appError(
            ErrorCode.INVALID_DEVICE_ID,
            'This request is missing its device identifier.',
            {
              reason: 'MISSING',
            }
          );
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

    requestPasswordReset: async (_p: unknown, args: { email: string }, context: Context) => {
      try {
        return await authService.requestPasswordReset(args.email, context.ip);
      } catch (error) {
        throw handleError(error, 'requestPasswordReset');
      }
    },

    //Resends the reset code; same as requestPasswordReset with its own rate limit.
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
        const origin = context.sessionOrigin;
        if (!origin) {
          throw appError(ErrorCode.SESSION_EXPIRED, 'Please sign in again to continue.');
        }
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

  //Tells GraphQL which LoginResult member was returned.
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
