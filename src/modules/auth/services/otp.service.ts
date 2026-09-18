import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import type { Types } from 'mongoose';
import { Otp, type OtpPurpose } from '../models/otp.model.js';
import { env } from '../../../config/env.js';
import { AppError } from '../../../core/errors/AppError.js';
import { ErrorCode } from '../../../core/errors/codes.js';
import { minutesFromNow, secondsSince } from '../../../shared/utils/datetime.js';

//ONE-TIME CODES: ISSUE, VERIFY, CONSUME.
//
//Every rule the design fixes lives here and nowhere else, so there is one
//place to audit and one place to change.
//
//The code is generated with crypto.randomInt, never Math.random — Math.random
//is seeded predictably and a sequence of its outputs can be reconstructed.
//
//It is stored as a bcrypt hash for the same reason a password is: a database
//that leaks must not contain live codes. bcrypt also gives constant-time
//comparison for free, so a timing signal cannot leak digits.

//A lower cost than a password uses. A code lives ten minutes and dies after
//five guesses, so the work factor protecting it does not need to hold for
//years — and hashing is on the hot path of every verify.
const OTP_HASH_ROUNDS = 8;

export interface IssuedOtp {
  code: string;
  expiresAt: Date;
}

const generateCode = (): string => String(randomInt(0, 1_000_000)).padStart(6, '0');

//RESEND GUARD.
//
//Two separate limits. The cooldown stops a double-tapped button spending the
//hourly budget in two seconds; the hourly cap is what actually bounds cost and
//abuse. Both are checked before a code is generated, so a refused resend never
//invalidates the code the user is currently reading.
const assertCanIssue = async (user: Types.ObjectId, purpose: OtpPurpose): Promise<void> => {
  const latest = await Otp.findOne({ user, purpose }).sort({ createdAt: -1 }).lean();

  if (latest) {
    const elapsed = secondsSince(latest.createdAt);
    if (elapsed < env.OTP_RESEND_COOLDOWN_SECONDS) {
      throw new AppError(
        ErrorCode.OTP_COOLDOWN,
        'Please wait a moment before asking for another code.',
        { meta: { retryAfterSeconds: env.OTP_RESEND_COOLDOWN_SECONDS - elapsed } }
      );
    }
  }

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentCount = await Otp.countDocuments({
    user,
    purpose,
    createdAt: { $gte: hourAgo },
  });

  if (recentCount >= env.OTP_RESENDS_PER_HOUR) {
    throw new AppError(
      ErrorCode.OTP_RESEND_LIMIT,
      'You have asked for too many codes. Please try again in an hour.'
    );
  }
};

export const issueOtp = async (params: {
  user: Types.ObjectId;
  purpose: OtpPurpose;
  ip: string;
  deviceId?: string | null;
  //Signup issues the first code without a cooldown check — there is nothing
  //to cool down from, and the account was created in the same breath.
  skipGuard?: boolean;
}): Promise<IssuedOtp> => {
  if (!params.skipGuard) {
    await assertCanIssue(params.user, params.purpose);
  }

  //ONE LIVE CODE PER USER PER PURPOSE.
  //
  //Asking for a new code kills the old one. Without this, a user who requests
  //twice has two valid codes and reads the newer email while the older code is
  //also still accepted — which doubles the guessing surface and confuses
  //anyone who scrolls up to the first message.
  await Otp.updateMany(
    { user: params.user, purpose: params.purpose, consumedAt: null },
    { $set: { consumedAt: new Date() } }
  );

  const code = generateCode();
  const expiresAt = minutesFromNow(env.OTP_TTL_MINUTES);

  await Otp.create({
    user: params.user,
    codeHash: await bcrypt.hash(code, OTP_HASH_ROUNDS),
    purpose: params.purpose,
    channel: 'EMAIL',
    deviceId: params.deviceId ?? null,
    expiresAt,
    ip: params.ip,
  });

  return { code, expiresAt };
};

//VERIFY AND CONSUME.
//
//Returns the deviceId the code was issued for, so a LOGIN code can only ever
//trust the phone that asked for it.
export const verifyOtp = async (params: {
  user: Types.ObjectId;
  purpose: OtpPurpose;
  code: string;
}): Promise<{ deviceId: string | null }> => {
  const record = await Otp.findOne({
    user: params.user,
    purpose: params.purpose,
    consumedAt: null,
  }).sort({ createdAt: -1 });

  if (!record) {
    throw new AppError(
      ErrorCode.OTP_NOT_FOUND,
      'That code is no longer valid. Please ask for a new one.'
    );
  }

  //The TTL index sweeps about once a minute, so a row can outlive its own
  //expiry. Expiry is enforced here; the index is housekeeping.
  if (record.expiresAt.getTime() <= Date.now()) {
    record.consumedAt = new Date();
    await record.save();
    throw new AppError(ErrorCode.OTP_EXPIRED, 'That code has expired. Please ask for a new one.');
  }

  if (record.attempts >= env.OTP_MAX_ATTEMPTS) {
    record.consumedAt = new Date();
    await record.save();
    throw new AppError(
      ErrorCode.OTP_ATTEMPTS_EXCEEDED,
      'Too many incorrect attempts. Please ask for a new code.'
    );
  }

  const matches = await bcrypt.compare(params.code, record.codeHash);

  if (!matches) {
    record.attempts += 1;
    //Spending the last attempt kills the code immediately rather than leaving
    //a dead row that would report OTP_INCORRECT again on the next try. The
    //user is told plainly that the code is finished, and offered a resend.
    const exhausted = record.attempts >= env.OTP_MAX_ATTEMPTS;
    if (exhausted) record.consumedAt = new Date();
    await record.save();

    throw new AppError(
      exhausted ? ErrorCode.OTP_ATTEMPTS_EXCEEDED : ErrorCode.OTP_INCORRECT,
      exhausted
        ? 'Too many incorrect attempts. Please ask for a new code.'
        : 'That code is not right.',
      { meta: { attemptsLeft: Math.max(0, env.OTP_MAX_ATTEMPTS - record.attempts) } }
    );
  }

  //Single use, consumed the moment it verifies. A replay of the same six
  //digits finds consumedAt set and falls through to OTP_NOT_FOUND.
  record.consumedAt = new Date();
  await record.save();

  return { deviceId: record.deviceId };
};

//Used by account deletion. Every user-owned collection has one of these.
export const purgeOtpsForUser = async (user: Types.ObjectId): Promise<void> => {
  await Otp.deleteMany({ user });
};
