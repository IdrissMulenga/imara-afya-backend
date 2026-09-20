import { open, authed } from '../guards.js';
import { defineFeature } from '../module.js';
import { types, queries, mutations } from './auth.typedefs.js';
import { DomainError } from '../../../domain/shared/errors/domain.error.js';
import { ErrorCode } from '../../../domain/shared/errors/error-codes.js';
import type { User } from '../../../domain/auth/entities/user.entity.js';
import type { TrustedDevice } from '../../../domain/auth/entities/trusted-device.entity.js';
import {
  isSessionResult,
  type ProfilePatch,
  type PreferencesPatch,
} from '../../../application/auth/dto/auth.dto.js';
import type { AuthUseCases } from '../../../application/auth/index.js';

//THE GRAPHQL ADAPTER FOR AUTH.
//
//Every resolver here does three things and no more: unwrap arguments, call a
//use case, hand back the result. No branching, no validation, no persistence.
//
//The use cases are INJECTED rather than imported. That is what keeps this a
//genuine adapter — swap in fakes and the whole GraphQL surface can be
//exercised with no database and no mail provider.

type Input<T> = { input: T };

export const createAuthFeature = (useCases: AuthUseCases) =>
  defineFeature({
    name: 'auth',
    typeDefs: { types, queries, mutations },

    resolvers: {
      Query: {
        me: authed('me', (_args: unknown, context) => useCases.getMe(context.caller.id)),

        myTrustedDevices: authed('myTrustedDevices', async (_args: unknown, context) => {
          const devices = await useCases.listTrustedDevices(context.caller.id);
          const currentDeviceId = context.request.get('x-device-id');

          return devices.map((device) => ({
            id: device.id,
            label: device.label,
            lastSeenAt: device.lastSeenAt.toISOString(),
            expiresAt: device.expiresAt.toISOString(),
            current: Boolean(currentDeviceId) && device.deviceId === currentDeviceId,
          }));
        }),
      },

      Mutation: {
        //--- account creation and sign-in ---
        signup: open(
          'signup',
          (
            args: Input<{
              email: string;
              password: string;
              deviceId: string;
              deviceLabel?: string;
            }>,
            context
          ) => useCases.signup({ ...args.input, ip: context.ip })
        ),

        login: open(
          'login',
          (
            args: Input<{
              email: string;
              password: string;
              deviceId: string;
              deviceLabel?: string;
            }>,
            context
          ) => useCases.login({ ...args.input, ip: context.ip })
        ),

        verifyLoginOtp: open(
          'verifyLoginOtp',
          (args: {
            email: string;
            input: { code: string; deviceId?: string; deviceLabel?: string };
          }) => {
            if (!args.input.deviceId) {
              throw new DomainError(
                ErrorCode.INVALID_DEVICE_ID,
                'This request is missing its device identifier.'
              );
            }
            return useCases.verifyLoginOtp({
              email: args.email,
              code: args.input.code,
              deviceId: args.input.deviceId,
              deviceLabel: args.input.deviceLabel,
            });
          }
        ),

        resendLoginOtp: open(
          'resendLoginOtp',
          (args: { email: string; deviceId: string }, context) =>
            useCases.resendLoginOtp({ ...args, ip: context.ip })
        ),

        //--- email verification ---
        verifyEmailOtp: authed('verifyEmailOtp', (args: Input<{ code: string }>, context) =>
          useCases.verifyEmailOtp({ userId: context.caller.id, code: args.input.code })
        ),

        resendEmailOtp: authed('resendEmailOtp', (_args: unknown, context) =>
          useCases.resendEmailOtp({ userId: context.caller.id, ip: context.ip })
        ),

        //--- password reset ---
        requestPasswordReset: open(
          'requestPasswordReset',
          (args: { email: string }, context) =>
            useCases.requestPasswordReset({ email: args.email, ip: context.ip })
        ),

        //Same use case, separate field, so the two have separate rate-limit
        //budgets: a first request and a resend are different behaviours to a
        //limiter even when they do the same work.
        resendPasswordResetOtp: open(
          'resendPasswordResetOtp',
          (args: { email: string }, context) =>
            useCases.requestPasswordReset({ email: args.email, ip: context.ip })
        ),

        verifyPasswordResetOtp: open(
          'verifyPasswordResetOtp',
          async (args: Input<{ email: string; code: string }>) => {
            const ticket = await useCases.verifyPasswordResetOtp(args.input);
            return { resetToken: ticket.resetToken, expiresAt: ticket.expiresAt.toISOString() };
          }
        ),

        resetPassword: open(
          'resetPassword',
          (
            args: Input<{
              resetToken: string;
              password: string;
              deviceId: string;
              deviceLabel?: string;
            }>
          ) => useCases.resetPassword(args.input)
        ),

        //--- session management ---
        changePassword: authed(
          'changePassword',
          (args: Input<{ currentPassword: string; newPassword: string }>, context) =>
            useCases.changePassword({ userId: context.caller.id, ...args.input })
        ),

        refreshSession: authed('refreshSession', (_args: unknown, context) =>
          useCases.refreshSession({
            userId: context.caller.id,
            origin: context.request.get('x-session-origin') ?? new Date().toISOString(),
          })
        ),

        logout: authed('logout', (_args: unknown, context) =>
          useCases.logout(context.caller.id)
        ),

        revokeTrustedDevice: authed('revokeTrustedDevice', (args: { id: string }, context) =>
          useCases.revokeTrustedDevice({
            userId: context.caller.id,
            deviceRowId: args.id,
          })
        ),

        //--- profile ---
        updateProfile: authed(
          'updateProfile',
          (args: Input<ProfilePatch>, context) =>
            useCases.updateProfile({ userId: context.caller.id, patch: args.input })
        ),

        setPreferences: authed(
          'setPreferences',
          (args: Input<PreferencesPatch>, context) =>
            useCases.setPreferences({ userId: context.caller.id, patch: args.input })
        ),

        deleteAccount: authed(
          'deleteAccount',
          (args: Input<{ password: string }>, context) =>
            useCases.deleteAccount({
              userId: context.caller.id,
              password: args.input.password,
            })
        ),
      },

      //TYPE-LEVEL RESOLVERS.
      //
      //The union needs a __resolveType or every login response fails at
      //runtime. This is exactly the case a Query/Mutation-only barrel drops.
      types: {
        LoginResult: {
          __resolveType: (value: Parameters<typeof isSessionResult>[0]) =>
            isSessionResult(value) ? 'AuthPayload' : 'OtpChallenge',
        },

        //The entity exposes rules; this maps it to the wire. `bmi` is derived
        //on the entity rather than stored, so it can never disagree with the
        //weight the user just logged.
        User: {
          id: (user: User) => user.id,
          email: (user: User) => user.email,
          emailVerified: (user: User) => user.emailVerified,
          name: (user: User) => user.snapshot.name,
          photoUrl: (user: User) => user.snapshot.photoUrl,
          gender: (user: User) => user.snapshot.gender,
          birthDate: (user: User) => user.snapshot.birthDate?.toISOString() ?? null,
          heightCm: (user: User) => user.snapshot.heightCm,
          weightKg: (user: User) => user.snapshot.weightKg,
          bmi: (user: User) => user.bmi,
          language: (user: User) => user.snapshot.language,
          units: (user: User) => user.snapshot.units,
          timezone: (user: User) => user.timezone,
          cycleTrackingEnabled: (user: User) => user.snapshot.cycleTrackingEnabled,
          waterGoalGlasses: (user: User) => user.snapshot.waterGoalGlasses,
          stepGoal: (user: User) => user.snapshot.stepGoal,
          sleepGoalHours: (user: User) => user.snapshot.sleepGoalHours,
          createdAt: (user: User) => user.snapshot.createdAt.toISOString(),
        },

        AuthPayload: {
          user: (payload: { user: User }) => payload.user,
        },

        OtpChallenge: {
          expiresAt: (challenge: { expiresAt: Date }) => challenge.expiresAt.toISOString(),
        },

        TrustedDevice: {
          id: (device: TrustedDevice) => device.id,
        },
      },
    },
  });
