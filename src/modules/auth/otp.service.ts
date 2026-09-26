import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import type { Types } from 'mongoose';
import { Otp, type OtpPurpose } from './otp.model.js';
import type { IUser } from '../user/index.js';
import { env } from '../../config/env.js';
import { appError, ErrorCode } from '../../shared/errors.js';
import { checkOtpCode } from '../../shared/validation.js';
import { minutesFromNow, secondsSince } from '../../shared/datetime.js';
import { sendOtpEmail } from './mail.service.js';

const OTP_ROUNDS = 8;

//The error for a code that is missing, used or unknown.
export const codeNotValid = () =>
  appError(ErrorCode.OTP_NOT_FOUND, 'That code is no longer valid. Please ask for a new one.');

const tooManyAttempts = () =>
  appError(
    ErrorCode.OTP_ATTEMPTS_EXCEEDED,
    'Too many incorrect attempts. Please ask for a new code.'
  );

//Marks a code as used so it can no longer be entered.
const retire = (id: Types.ObjectId) =>
  Otp.updateOne({ _id: id }, { $set: { consumedAt: new Date() } });

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

  const saved = await Otp.create({
    user: params.user._id,
    codeHash: await bcrypt.hash(code, OTP_ROUNDS),
    purpose: params.purpose,
    channel: 'EMAIL',
    deviceId: params.deviceId ?? null,
    expiresAt,
    purgeAt,
    ip: params.ip,
  });

  //Removes a code that was never delivered, so it does not count toward the limits.
  try {
    await sendOtpEmail({
      to: params.user.email,
      code,
      purpose: params.purpose,
      language: params.user.language,
    });
  } catch (error) {
    await Otp.deleteOne({ _id: saved._id }).catch(() => {});
    throw error;
  }

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

  if (!otp) throw codeNotValid();

  if (otp.expiresAt.getTime() <= Date.now()) {
    await retire(otp._id);
    throw appError(ErrorCode.OTP_EXPIRED, 'That code has expired. Please ask for a new one.');
  }

  if (otp.attempts >= env.OTP_MAX_ATTEMPTS) {
    await retire(otp._id);
    throw tooManyAttempts();
  }

  if (!(await bcrypt.compare(submitted, otp.codeHash))) {
    //Counts the failed attempt atomically.
    const counted = await Otp.findOneAndUpdate(
      { _id: otp._id },
      { $inc: { attempts: 1 } },
      { returnDocument: 'after', projection: { attempts: 1 } }
    ).lean();

    const attempts = counted?.attempts ?? otp.attempts + 1;

    if (attempts >= env.OTP_MAX_ATTEMPTS) {
      await retire(otp._id);
      throw tooManyAttempts();
    }
    throw appError(ErrorCode.OTP_INCORRECT, 'That code is not right.', {
      attemptsLeft: env.OTP_MAX_ATTEMPTS - attempts,
    });
  }

  //Consumes the code; only one concurrent request can claim it.
  const claimed = await Otp.findOneAndUpdate(
    { _id: otp._id, consumedAt: null },
    { $set: { consumedAt: new Date() } },
    { projection: { deviceId: 1 } }
  ).lean();

  if (!claimed) throw codeNotValid();

  return { deviceId: claimed.deviceId };
};
