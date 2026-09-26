import * as authService from './auth.service.js';
import { listDevices, revokeDevice } from './device.service.js';
import { isAuthPayload } from './auth.types.js';
import { safe, withUser } from '../../shared/resolve.js';
import type { IUser } from '../user/index.js';
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
    myTrustedDevices: withUser((user, _a: unknown, context) =>
      listDevices(user._id, context.req.get('x-device-id'))
    ),
  },

  Mutation: {
    signup: safe((args: { input: SignUpInput }, context) =>
      authService.signup({ ...args.input, ip: context.ip })
    ),

    login: safe((args: { input: LoginInput }, context) =>
      authService.login({ ...args.input, ip: context.ip })
    ),

    verifyLoginOtp: safe((args: { email: string; input: VerifyOtpInput }) =>
      authService.verifyLoginOtp({ email: args.email, ...args.input })
    ),

    resendLoginOtp: safe((args: { email: string; deviceId: string }, context) =>
      authService.resendLoginOtp(args.email, args.deviceId, context.ip)
    ),

    verifyEmailOtp: withUser((user, args: { input: VerifyOtpInput }) =>
      authService.verifyEmailOtp(user, args.input.code)
    ),

    resendEmailOtp: withUser((user, _a: unknown, context) =>
      authService.resendEmailOtp(user, context.ip)
    ),

    requestPasswordReset: safe((args: { email: string }, context) =>
      authService.requestPasswordReset(args.email, context.ip)
    ),

    //Resends the reset code; same as requestPasswordReset with its own rate limit.
    resendPasswordResetOtp: safe((args: { email: string }, context) =>
      authService.requestPasswordReset(args.email, context.ip)
    ),

    verifyPasswordResetOtp: safe(async (args: { input: VerifyResetOtpInput }) => {
      const ticket = await authService.verifyPasswordResetOtp(args.input.email, args.input.code);
      return { resetToken: ticket.resetToken, expiresAt: ticket.expiresAt.toISOString() };
    }),

    resetPassword: safe((args: { input: ResetPasswordInput }) =>
      authService.resetPassword(args.input)
    ),

    changePassword: withUser((user, args: { input: ChangePasswordInput }) =>
      authService.changePassword(user, args.input)
    ),

    refreshSession: withUser((user, _a: unknown, context) =>
      authService.refreshSession(user, context.sessionOrigin)
    ),

    logout: withUser((user) => authService.logout(user)),

    revokeTrustedDevice: withUser((user, args: { id: string }) => revokeDevice(user._id, args.id)),
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
