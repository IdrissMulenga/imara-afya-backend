import { env } from './env.js';
import type { AuthPolicy } from '../../application/auth/ports/auth-policy.port.js';

//THE POLICY PORT, FILLED FROM THE ENVIRONMENT.
//
//This is the seam. The application declares the numbers it needs; this file is
//the only place that knows they come from environment variables. A test builds
//the same shape by hand with a two-second expiry and runs the real rules.

export const authPolicy: AuthPolicy = {
  otpTtlMinutes: env.OTP_TTL_MINUTES,
  otpMaxAttempts: env.OTP_MAX_ATTEMPTS,
  otpResendCooldownSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
  otpResendsPerHour: env.OTP_RESENDS_PER_HOUR,
  deviceTrustDays: env.DEVICE_TRUST_DAYS,
  maxPasswordAttempts: env.MAX_PASSWORD_ATTEMPTS,
  resetTokenMinutes: env.RESET_TOKEN_MINUTES,
  maxTrustedDevices: 50,
  passwordHashRounds: 12,
  //Lower than a password's on purpose — see the note on the port.
  otpHashRounds: 8,
};
