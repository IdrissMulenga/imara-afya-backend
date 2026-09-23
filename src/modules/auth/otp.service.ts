import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import type { Types } from 'mongoose';
import { Otp, type OtpPurpose } from './otp.model.js';
import type { IUser } from '../user/user.model.js';
import { env } from '../../config/env.js';
import { appError, ErrorCode } from '../../shared/errors.js';
import { checkOtpCode } from '../../shared/validation.js';
import { minutesFromNow, secondsSince } from '../../shared/datetime.js';
import { sendOtpEmail } from './mail.service.js';

const OTP_ROUNDS = 8;

//Six-digit code from a cryptographic RNG.
const generateCode = (): string => String(randomInt(0, 1_000_000)).padStart(6, '0');

//Enforces the resend cooldown and the hourly limit.
const checkCanIssue = async (userId: Types.ObjectId, purpose: OtpPurpose): Promise<void> => {
  const latest = await Otp.findOne({ user: userId, purpose }).sort({ createdAt: -1 }).lean();

  if (latest) {
    const elapsed = secondsSince(latest.createdAt);
    if (elapsed < env.OTP_RESEND_COOLDOWN_SECONDS) {
      throw appError(
        ErrorCode.OTP_COOLDOWN,
        'Please wait a moment before asking for another code.',
        {
          retryAfterSeconds: env.OTP_RESEND_COOLDOWN_SECONDS - elapsed,
        }
      );
    }
  }

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await Otp.countDocuments({ user: userId, purpose, createdAt: { $gte: hourAgo } });

  if (recent >= env.OTP_RESENDS_PER_HOUR) {
    throw appError(
      ErrorCode.OTP_RESEND_LIMIT,
      'You have asked for too many codes. Please try again in an hour.'
    );
  }
};

//Creates a code, stores its hash and emails it. Returns the expiry time.
export const sendCode = async (params: {
  user: IUser;
  purpose: OtpPurpose;
  ip: string;
  deviceId?: string | null;
  skipCooldown?: boolean;
}): Promise<Date> => {
  if (!params.skipCooldown) {
    await checkCanIssue(params.user._id, params.purpose);
  }

  //Retires any earlier live code for this purpose.
  await Otp.updateMany(
    { user: params.user._id, purpose: params.purpose, consumedAt: null },
    { $set: { consumedAt: new Date() } }
  );

  const code = generateCode();
  const expiresAt = minutesFromNow(env.OTP_TTL_MINUTES);
  const purgeAt = minutesFromNow(env.OTP_TTL_MINUTES + 120);

  await Otp.create({
    user: params.user._id,
    codeHash: await bcrypt.hash(code, OTP_ROUNDS),
    purpose: params.purpose,
    channel: 'EMAIL',
    deviceId: params.deviceId ?? null,
    expiresAt,
    purgeAt,
    ip: params.ip,
  });

  await sendOtpEmail({
    to: params.user.email,
    code,
    purpose: params.purpose,
    language: params.user.language,
  });

  return expiresAt;
};

//Like sendCode, but logs delivery failures instead of throwing. Used by signup.
export const sendCodeBestEffort = async (params: {
  user: IUser;
  purpose: OtpPurpose;
  ip: string;
  skipCooldown?: boolean;
}): Promise<void> => {
  try {
    await sendCode(params);
  } catch (error) {
    console.warn('[otp] code issued but not delivered:', error);
  }
};

//Checks and consumes a code. Returns the device it was issued for.
export const verifyCode = async (params: {
  userId: Types.ObjectId;
  purpose: OtpPurpose;
  code: string;
}): Promise<{ deviceId: string | null }> => {
  const submitted = checkOtpCode(params.code);

  const otp = await Otp.findOne({
    user: params.userId,
    purpose: params.purpose,
    consumedAt: null,
  }).sort({
    createdAt: -1,
  });

  if (!otp) {
    throw appError(
      ErrorCode.OTP_NOT_FOUND,
      'That code is no longer valid. Please ask for a new one.'
    );
  }

  if (otp.expiresAt.getTime() <= Date.now()) {
    await Otp.updateOne({ _id: otp._id }, { $set: { consumedAt: new Date() } });
    throw appError(ErrorCode.OTP_EXPIRED, 'That code has expired. Please ask for a new one.');
  }

  if (otp.attempts >= env.OTP_MAX_ATTEMPTS) {
    await Otp.updateOne({ _id: otp._id }, { $set: { consumedAt: new Date() } });
    throw appError(
      ErrorCode.OTP_ATTEMPTS_EXCEEDED,
      'Too many incorrect attempts. Please ask for a new code.'
    );
  }

  if (!(await bcrypt.compare(submitted, otp.codeHash))) {
    //Counts the failed attempt atomically.
    const counted = await Otp.findOneAndUpdate(
      { _id: otp._id },
      { $inc: { attempts: 1 } },
      { new: true, projection: { attempts: 1 } }
    ).lean();

    const attempts = counted?.attempts ?? otp.attempts + 1;

    const exhausted = attempts >= env.OTP_MAX_ATTEMPTS;
    if (exhausted) {
      await Otp.updateOne({ _id: otp._id }, { $set: { consumedAt: new Date() } });
    }

    throw appError(
      exhausted ? ErrorCode.OTP_ATTEMPTS_EXCEEDED : ErrorCode.OTP_INCORRECT,
      exhausted
        ? 'Too many incorrect attempts. Please ask for a new code.'
        : 'That code is not right.',
      { attemptsLeft: Math.max(0, env.OTP_MAX_ATTEMPTS - attempts) }
    );
  }

  //Consumes the code; only one concurrent request can claim it.
  const claimed = await Otp.findOneAndUpdate(
    { _id: otp._id, consumedAt: null },
    { $set: { consumedAt: new Date() } },
    { projection: { deviceId: 1 } }
  ).lean();

  if (!claimed) {
    throw appError(
      ErrorCode.OTP_NOT_FOUND,
      'That code is no longer valid. Please ask for a new one.'
    );
  }

  return { deviceId: claimed.deviceId };
};
