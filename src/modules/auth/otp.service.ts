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

//ONE-TIME CODES: create, send, verify.
//
//Every rule about codes lives in this file. One place to read, one to change.

//Lower than a password's 12. A code lives ten minutes and dies after five
//guesses, so the work protecting it does not need to hold for years — and
//hashing sits on the hot path of every verification.
const OTP_ROUNDS = 8;

//randomInt, never Math.random. Math.random is seeded predictably and a
//sequence of its outputs can be reconstructed — for a login code that is the
//whole game.
const generateCode = (): string => String(randomInt(0, 1_000_000)).padStart(6, '0');

//Two limits. The cooldown stops a double-tapped button spending the hourly
//budget in two seconds; the hourly cap is what actually bounds cost and abuse.
//Both are checked BEFORE a code is generated, so a refused resend never kills
//the code the user is currently reading.
const checkCanIssue = async (userId: Types.ObjectId, purpose: OtpPurpose): Promise<void> => {
  const latest = await Otp.findOne({ user: userId, purpose }).sort({ createdAt: -1 }).lean();

  if (latest) {
    const elapsed = secondsSince(latest.createdAt);
    if (elapsed < env.OTP_RESEND_COOLDOWN_SECONDS) {
      throw appError(ErrorCode.OTP_COOLDOWN, 'Please wait a moment before asking for another code.', {
        retryAfterSeconds: env.OTP_RESEND_COOLDOWN_SECONDS - elapsed,
      });
    }
  }

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await Otp.countDocuments({ user: userId, purpose, createdAt: { $gte: hourAgo } });

  if (recent >= env.OTP_RESENDS_PER_HOUR) {
    throw appError(ErrorCode.OTP_RESEND_LIMIT, 'You have asked for too many codes. Please try again in an hour.');
  }
};

//Creates a code, saves its hash, emails it. Returns when it expires so the app
//can show a countdown.
export const sendCode = async (params: {
  user: IUser;
  purpose: OtpPurpose;
  ip: string;
  deviceId?: string | null;
  //Signup skips the cooldown — there is nothing to cool down from, and the
  //account was created in the same request.
  skipCooldown?: boolean;
}): Promise<Date> => {
  if (!params.skipCooldown) {
    await checkCanIssue(params.user._id, params.purpose);
  }

  //ONE LIVE CODE PER USER PER PURPOSE.
  //
  //Without this, asking twice leaves two valid codes: the user reads the newer
  //email while the older one still works, which doubles the guessing surface
  //and confuses anyone who scrolls up.
  await Otp.updateMany(
    { user: params.user._id, purpose: params.purpose, consumedAt: null },
    { $set: { consumedAt: new Date() } }
  );

  const code = generateCode();
  const expiresAt = minutesFromNow(env.OTP_TTL_MINUTES);
  //Kept two hours past the code's death so the hourly count in checkCanIssue
  //has a full hour of history to read. See the note in otp.model.ts.
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

//Same, but a send failure is logged and swallowed. Used ONLY by signup, where
//the account and the session are valid whether or not the email lands, and the
//app offers a resend button.
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

//Checks a code and uses it up. Returns the device it was issued for, so a
//LOGIN code can only ever trust the phone that asked for it.
export const verifyCode = async (params: {
  userId: Types.ObjectId;
  purpose: OtpPurpose;
  code: string;
}): Promise<{ deviceId: string | null }> => {
  const submitted = checkOtpCode(params.code);

  const otp = await Otp.findOne({ user: params.userId, purpose: params.purpose, consumedAt: null }).sort({
    createdAt: -1,
  });

  if (!otp) {
    throw appError(ErrorCode.OTP_NOT_FOUND, 'That code is no longer valid. Please ask for a new one.');
  }

  //The TTL index sweeps about once a minute, so a row can outlive its own
  //expiry. Expiry is enforced HERE; the index is just housekeeping.
  if (otp.expiresAt.getTime() <= Date.now()) {
    await Otp.updateOne({ _id: otp._id }, { $set: { consumedAt: new Date() } });
    throw appError(ErrorCode.OTP_EXPIRED, 'That code has expired. Please ask for a new one.');
  }

  if (otp.attempts >= env.OTP_MAX_ATTEMPTS) {
    await Otp.updateOne({ _id: otp._id }, { $set: { consumedAt: new Date() } });
    throw appError(ErrorCode.OTP_ATTEMPTS_EXCEEDED, 'Too many incorrect attempts. Please ask for a new code.');
  }

  if (!(await bcrypt.compare(submitted, otp.codeHash))) {
    //COUNTED IN THE DATABASE, not in memory.
    //
    //`otp.attempts += 1; await otp.save()` is a read-then-write, and guesses
    //that arrive together all read the same number and all write the same
    //number back. Ten parallel requests cost one attempt, so the five-attempt
    //cap could be walked straight past by anyone sending requests in parallel.
    //A single $inc cannot be raced.
    const counted = await Otp.findOneAndUpdate(
      { _id: otp._id },
      { $inc: { attempts: 1 } },
      { new: true, projection: { attempts: 1 } }
    ).lean();

    const attempts = counted?.attempts ?? otp.attempts + 1;

    //Spending the last attempt kills the code now, so the user is told plainly
    //that it is finished instead of getting "incorrect" on a code that can no
    //longer succeed.
    const exhausted = attempts >= env.OTP_MAX_ATTEMPTS;
    if (exhausted) {
      await Otp.updateOne({ _id: otp._id }, { $set: { consumedAt: new Date() } });
    }

    throw appError(
      exhausted ? ErrorCode.OTP_ATTEMPTS_EXCEEDED : ErrorCode.OTP_INCORRECT,
      exhausted ? 'Too many incorrect attempts. Please ask for a new code.' : 'That code is not right.',
      { attemptsLeft: Math.max(0, env.OTP_MAX_ATTEMPTS - attempts) }
    );
  }

  //Used up the moment it works. Replaying the same six digits finds it consumed
  //and falls through to OTP_NOT_FOUND.
  //
  //`consumedAt: null` in the FILTER makes this a claim rather than an
  //overwrite: if two requests race with the correct code, exactly one of them
  //wins the row and the loser is told the code is spent.
  const claimed = await Otp.findOneAndUpdate(
    { _id: otp._id, consumedAt: null },
    { $set: { consumedAt: new Date() } },
    { projection: { deviceId: 1 } }
  ).lean();

  if (!claimed) {
    throw appError(ErrorCode.OTP_NOT_FOUND, 'That code is no longer valid. Please ask for a new one.');
  }

  return { deviceId: claimed.deviceId };
};
