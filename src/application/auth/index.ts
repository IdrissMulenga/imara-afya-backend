import type { UserRepository } from '../../domain/auth/repositories/user.repository.js';
import type { OtpRepository } from '../../domain/auth/repositories/otp.repository.js';
import type { TrustedDeviceRepository } from '../../domain/auth/repositories/trusted-device.repository.js';
import type { Hasher } from './ports/hasher.port.js';
import type { TokenService } from './ports/token.port.js';
import type { MailService } from './ports/mail.port.js';
import type { Clock } from './ports/clock.port.js';
import type { RandomSource } from './ports/random.port.js';
import type { AuthPolicy } from './ports/auth-policy.port.js';

import { createOtpService } from './services/otp.service.js';
import { createDeviceTrustService } from './services/device-trust.service.js';
import { createCodeDelivery } from './services/code-delivery.service.js';

import { makeSignup } from './use-cases/signup.use-case.js';
import { makeLogin } from './use-cases/login.use-case.js';
import { makeVerifyLoginOtp } from './use-cases/verify-login-otp.use-case.js';
import { makeVerifyEmailOtp } from './use-cases/verify-email-otp.use-case.js';
import { makeResendEmailOtp } from './use-cases/resend-email-otp.use-case.js';
import { makeResendLoginOtp } from './use-cases/resend-login-otp.use-case.js';
import { makeRequestPasswordReset } from './use-cases/request-password-reset.use-case.js';
import { makeVerifyPasswordResetOtp } from './use-cases/verify-password-reset-otp.use-case.js';
import { makeResetPassword } from './use-cases/reset-password.use-case.js';
import { makeChangePassword } from './use-cases/change-password.use-case.js';
import { makeRefreshSession, makeLogout, makeGetMe } from './use-cases/session.use-cases.js';
import {
  makeListTrustedDevices,
  makeRevokeTrustedDevice,
} from './use-cases/device.use-cases.js';
import { makeUpdateProfile, makeSetPreferences } from './use-cases/profile.use-cases.js';
import { makeDeleteAccount, type UserDataPurger } from './use-cases/delete-account.use-case.js';

//THE AUTH FEATURE, ASSEMBLED.
//
//Takes every dependency as an argument and hands back the callable use cases.
//This function is the only place that knows how auth's internal services wire
//together — the composition root supplies adapters, the interfaces layer calls
//the result, and neither needs to know the other exists.

export interface AuthDependencies {
  users: UserRepository;
  otps: OtpRepository;
  devices: TrustedDeviceRepository;
  hasher: Hasher;
  tokens: TokenService;
  mail: MailService;
  clock: Clock;
  random: RandomSource;
  policy: AuthPolicy;
  //Every feature's "erase this user's rows" function. Auth owns account
  //deletion, so it runs them all before removing the account itself.
  purgers: UserDataPurger[];
  //Reporting hooks. Kept as callbacks so the application layer never imports a
  //logger — it says what happened, infrastructure decides what to do with it.
  onDeliveryFailure?: (context: { purpose: string; error: unknown }) => void;
  onResetSuppressed?: (context: { reason: string; email?: string }) => void;
}

export const createAuthUseCases = (deps: AuthDependencies) => {
  const otpService = createOtpService({
    otps: deps.otps,
    hasher: deps.hasher,
    clock: deps.clock,
    random: deps.random,
    policy: deps.policy,
  });

  const deviceTrust = createDeviceTrustService({
    devices: deps.devices,
    clock: deps.clock,
    policy: deps.policy,
  });

  const codes = createCodeDelivery({
    otpService,
    mail: deps.mail,
    policy: deps.policy,
    onDeliveryFailure: deps.onDeliveryFailure,
  });

  const sessionDeps = { users: deps.users, tokens: deps.tokens, clock: deps.clock };
  const profileDeps = { users: deps.users, clock: deps.clock };
  const deviceDeps = { devices: deps.devices, deviceTrust };

  return {
    signup: makeSignup({
      users: deps.users,
      hasher: deps.hasher,
      tokens: deps.tokens,
      codes,
      deviceTrust,
      policy: deps.policy,
    }),

    login: makeLogin({
      users: deps.users,
      hasher: deps.hasher,
      tokens: deps.tokens,
      codes,
      deviceTrust,
    }),

    verifyLoginOtp: makeVerifyLoginOtp({
      users: deps.users,
      tokens: deps.tokens,
      otpService,
      deviceTrust,
    }),

    verifyEmailOtp: makeVerifyEmailOtp({
      users: deps.users,
      otpService,
      clock: deps.clock,
    }),

    resendEmailOtp: makeResendEmailOtp({ users: deps.users, codes }),
    resendLoginOtp: makeResendLoginOtp({ users: deps.users, codes }),

    requestPasswordReset: makeRequestPasswordReset({
      users: deps.users,
      codes,
      onSuppressed: deps.onResetSuppressed,
    }),

    verifyPasswordResetOtp: makeVerifyPasswordResetOtp({
      users: deps.users,
      tokens: deps.tokens,
      otpService,
      clock: deps.clock,
      policy: deps.policy,
    }),

    resetPassword: makeResetPassword({
      users: deps.users,
      hasher: deps.hasher,
      tokens: deps.tokens,
      deviceTrust,
      policy: deps.policy,
    }),

    changePassword: makeChangePassword({
      users: deps.users,
      hasher: deps.hasher,
      tokens: deps.tokens,
      policy: deps.policy,
    }),

    refreshSession: makeRefreshSession(sessionDeps),
    logout: makeLogout(sessionDeps),
    getMe: makeGetMe(sessionDeps),

    listTrustedDevices: makeListTrustedDevices(deviceDeps),
    revokeTrustedDevice: makeRevokeTrustedDevice(deviceDeps),

    updateProfile: makeUpdateProfile(profileDeps),
    setPreferences: makeSetPreferences(profileDeps),

    deleteAccount: makeDeleteAccount({
      users: deps.users,
      hasher: deps.hasher,
      purgers: deps.purgers,
    }),
  };
};

export type AuthUseCases = ReturnType<typeof createAuthUseCases>;
