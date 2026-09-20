import { Otp, type OtpPurpose } from '../../../domain/auth/entities/otp.entity.js';
import { OtpCode } from '../../../domain/auth/value-objects/otp-code.vo.js';
import { DomainError } from '../../../domain/shared/errors/domain.error.js';
import { ErrorCode } from '../../../domain/shared/errors/error-codes.js';
import type { OtpRepository } from '../../../domain/auth/repositories/otp.repository.js';
import type { Hasher } from '../ports/hasher.port.js';
import type { Clock } from '../ports/clock.port.js';
import type { RandomSource } from '../ports/random.port.js';
import type { AuthPolicy } from '../ports/auth-policy.port.js';

//ISSUING AND VERIFYING ONE-TIME CODES.
//
//An application service rather than a use case: it has no transport-facing
//operation of its own, but five use cases need exactly this logic and none of
//them should carry a copy.
//
//The rules about WHEN a code is dead live on the Otp entity. This service owns
//the orchestration around them — generating, hashing, persisting, and the
//resend limits, which are about protecting the mail budget rather than about
//what a code is.

export interface OtpServiceDeps {
  otps: OtpRepository;
  hasher: Hasher;
  clock: Clock;
  random: RandomSource;
  policy: AuthPolicy;
}

export interface IssuedOtp {
  code: string;
  expiresAt: Date;
}

export const createOtpService = (deps: OtpServiceDeps) => {
  const { otps, hasher, clock, random, policy } = deps;

  //Two separate limits. The cooldown stops a double-tapped button spending the
  //hourly budget in two seconds; the hourly cap is what actually bounds cost
  //and abuse. Both are checked BEFORE a code is generated, so a refused resend
  //never invalidates the code the user is currently reading.
  const assertCanIssue = async (userId: string, purpose: OtpPurpose): Promise<void> => {
    const now = clock.now();
    const latest = await otps.findLatest(userId, purpose);

    if (latest) {
      const elapsedSeconds = Math.floor(
        (now.getTime() - latest.createdAt.getTime()) / 1000
      );
      if (elapsedSeconds < policy.otpResendCooldownSeconds) {
        throw new DomainError(
          ErrorCode.OTP_COOLDOWN,
          'Please wait a moment before asking for another code.',
          { meta: { retryAfterSeconds: policy.otpResendCooldownSeconds - elapsedSeconds } }
        );
      }
    }

    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const recent = await otps.countSince(userId, purpose, hourAgo);

    if (recent >= policy.otpResendsPerHour) {
      throw new DomainError(
        ErrorCode.OTP_RESEND_LIMIT,
        'You have asked for too many codes. Please try again in an hour.'
      );
    }
  };

  const issue = async (params: {
    userId: string;
    purpose: OtpPurpose;
    ip: string;
    deviceId?: string | null;
    //Signup issues its first code without a cooldown check — there is nothing
    //to cool down from, and the account was created in the same breath.
    skipResendGuard?: boolean;
  }): Promise<IssuedOtp> => {
    if (!params.skipResendGuard) {
      await assertCanIssue(params.userId, params.purpose);
    }

    const now = clock.now();

    //ONE LIVE CODE PER USER PER PURPOSE.
    //
    //Without this a user who requests twice holds two valid codes, reads the
    //newer email, and the older one is also still accepted — which doubles the
    //guessing surface and confuses anyone who scrolls up.
    await otps.consumeAllLive(params.userId, params.purpose, now);

    const code = OtpCode.fromNumber(random.int(1_000_000));
    const expiresAt = new Date(now.getTime() + policy.otpTtlMinutes * 60_000);

    await otps.create({
      userId: params.userId,
      codeHash: await hasher.hash(code.value, policy.otpHashRounds),
      purpose: params.purpose,
      channel: 'EMAIL',
      deviceId: params.deviceId ?? null,
      expiresAt,
      ip: params.ip,
    });

    return { code: code.value, expiresAt };
  };

  //Verifies and consumes. Returns the device the code was issued for, so a
  //LOGIN code can only ever trust the phone that asked for it.
  const verify = async (params: {
    userId: string;
    purpose: OtpPurpose;
    code: string;
  }): Promise<{ deviceId: string | null }> => {
    const submitted = OtpCode.create(params.code);
    const now = clock.now();

    const otp = await otps.findLatestLive(params.userId, params.purpose);

    if (!otp) {
      throw new DomainError(
        ErrorCode.OTP_NOT_FOUND,
        'That code is no longer valid. Please ask for a new one.'
      );
    }

    //An unusable code is consumed on the way out rather than left as a dead
    //row that would report the same failure again on the next attempt.
    try {
      otp.assertUsable(now, policy.otpMaxAttempts);
    } catch (error) {
      otp.consume(now);
      await otps.save(otp);
      throw error;
    }

    if (!(await hasher.compare(submitted.value, otp.codeHash))) {
      otp.recordFailedAttempt();

      //Spending the last attempt kills the code immediately. The user is told
      //plainly that it is finished and offered a resend, rather than being
      //told "incorrect" on a code that can no longer succeed.
      const exhausted = otp.attemptsExhausted(policy.otpMaxAttempts);
      if (exhausted) otp.consume(now);
      await otps.save(otp);

      throw new DomainError(
        exhausted ? ErrorCode.OTP_ATTEMPTS_EXCEEDED : ErrorCode.OTP_INCORRECT,
        exhausted
          ? 'Too many incorrect attempts. Please ask for a new code.'
          : 'That code is not right.',
        { meta: { attemptsLeft: Math.max(0, policy.otpMaxAttempts - otp.attempts) } }
      );
    }

    //Single use, consumed the moment it verifies. A replay of the same six
    //digits finds it spent and falls through to OTP_NOT_FOUND.
    otp.consume(now);
    await otps.save(otp);

    return { deviceId: otp.deviceId };
  };

  return { issue, verify };
};

export type OtpService = ReturnType<typeof createOtpService>;
