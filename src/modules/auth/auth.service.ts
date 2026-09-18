import bcrypt from 'bcryptjs';
import { User, type UserDocument } from './models/user.model.js';
import { issueOtp, verifyOtp } from './services/otp.service.js';
import { sendOtpEmail } from './services/mail.service.js';
import {
  isTrusted,
  trustDevice,
  touchDevice,
  revokeAllDevices,
} from './services/device.service.js';
import {
  signSessionToken,
  signResetToken,
  verifyResetToken,
  sessionOriginExpired,
} from './services/token.service.js';
import { env } from '../../config/env.js';
import { AppError } from '../../core/errors/AppError.js';
import { ErrorCode } from '../../core/errors/codes.js';
import { logger, redact } from '../../core/logger.js';
import {
  normalizeEmail,
  assertPassword,
  assertOtpFormat,
  assertDeviceId,
  maskEmail,
} from '../../shared/utils/validation.js';

//THE AUTH FLOWS.
//
//Knows nothing about GraphQL — it takes plain objects, returns plain objects
//and throws AppError. The resolver layer is a thin translation on top.

const PASSWORD_HASH_ROUNDS = 12;

//A hash to compare against when no user matched. Without it, an unknown email
//returns in a millisecond while a known one takes the ~100ms bcrypt costs, and
//that difference tells an attacker which addresses have accounts. The compare
//must actually run — an `if (!user) return` before it defeats the whole point.
const DUMMY_HASH = bcrypt.hashSync('imara-afya-timing-equaliser', PASSWORD_HASH_ROUNDS);

export interface SessionResult {
  token: string;
  user: UserDocument;
}

export interface ChallengeResult {
  challenge: true;
  purpose: 'LOGIN';
  expiresAt: Date;
  maskedEmail: string;
}

const newSession = (user: UserDocument, origin = new Date()): SessionResult => ({
  token: signSessionToken(user.id, user.tokenVersion, origin),
  user,
});

//Send a code, and do not let a mail failure roll back work that already
//succeeded. On signup the account exists and the session is valid whether or
//not the email lands; the banner in the app offers a resend.
const deliver = async (params: {
  user: UserDocument;
  purpose: 'SIGNUP' | 'LOGIN' | 'RESET';
  ip: string;
  deviceId?: string | null;
  skipGuard?: boolean;
  //When true a send failure is swallowed and logged instead of thrown.
  bestEffort?: boolean;
}): Promise<Date> => {
  const { code, expiresAt } = await issueOtp({
    user: params.user._id,
    purpose: params.purpose,
    ip: params.ip,
    deviceId: params.deviceId,
    skipGuard: params.skipGuard,
  });

  try {
    await sendOtpEmail({
      to: params.user.email,
      code,
      purpose: params.purpose,
      language: params.user.language,
    });
  } catch (error) {
    if (!params.bestEffort) throw error;
    logger.warn('Code issued but not delivered', {
      to: redact(params.user.email),
      purpose: params.purpose,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return expiresAt;
};

//SIGNUP.
//
//Returns a working session immediately. Verification happens afterwards, from
//inside the app — an unverified user can track their day, and the one thing
//they cannot do is recover the account, because sending a recovery code to an
//unproven address is how an account gets handed to a typo.
export const signup = async (input: {
  email: string;
  password: string;
  deviceId: string;
  deviceLabel?: string;
  ip: string;
}): Promise<SessionResult> => {
  const email = normalizeEmail(input.email);
  assertPassword(input.password);
  const deviceId = assertDeviceId(input.deviceId);

  const existing = await User.exists({ email });
  if (existing) {
    throw new AppError(ErrorCode.EMAIL_TAKEN, 'That email address is already registered.');
  }

  const user = await User.create({
    email,
    passwordHash: await bcrypt.hash(input.password, PASSWORD_HASH_ROUNDS),
  });

  //The signing device is trusted from the start. Asking for a code on the
  //phone that just created the account proves nothing.
  await trustDevice({ user: user._id, deviceId, label: input.deviceLabel });

  await deliver({
    user,
    purpose: 'SIGNUP',
    ip: input.ip,
    skipGuard: true,
    bestEffort: true,
  });

  logger.info('Account created', { email: redact(email) });
  return newSession(user);
};

//LOGIN.
//
//Returns either a session or a challenge. A trusted device gets the token; a
//new one gets a code and no token at all.
export const login = async (input: {
  email: string;
  password: string;
  deviceId: string;
  deviceLabel?: string;
  ip: string;
}): Promise<SessionResult | ChallengeResult> => {
  const email = normalizeEmail(input.email);
  const deviceId = assertDeviceId(input.deviceId);

  const user = await User.findOne({ email });

  //Always compare, even with no user. See DUMMY_HASH above.
  const passwordMatches = await bcrypt.compare(
    input.password,
    user?.passwordHash ?? DUMMY_HASH
  );

  if (!user || !passwordMatches) {
    //One message for both cases, deliberately. "No account with that email"
    //is a free account-enumeration tool.
    throw new AppError(ErrorCode.INVALID_CREDENTIALS, 'That email or password is not right.');
  }

  if (await isTrusted(user._id, deviceId)) {
    await touchDevice(user._id, deviceId);
    return newSession(user);
  }

  //An unverified address cannot receive a login code, because we have no
  //evidence it belongs to this person. They can still sign in from the device
  //they signed up on, and verify from there.
  if (!user.emailVerified) {
    throw new AppError(
      ErrorCode.EMAIL_NOT_VERIFIED,
      'Please confirm your email address from the device you signed up on first.'
    );
  }

  const expiresAt = await deliver({
    user,
    purpose: 'LOGIN',
    ip: input.ip,
    deviceId,
  });

  return {
    challenge: true,
    purpose: 'LOGIN',
    expiresAt,
    maskedEmail: maskEmail(user.email),
  };
};

//VERIFY A LOGIN CODE.
//
//Unauthenticated: the caller has no token yet, which is the whole reason they
//are here. The email plus a live code for it is what identifies them.
export const verifyLoginOtp = async (input: {
  email: string;
  code: string;
  deviceId: string;
  deviceLabel?: string;
}): Promise<SessionResult> => {
  const email = normalizeEmail(input.email);
  const code = assertOtpFormat(input.code);
  const deviceId = assertDeviceId(input.deviceId);

  const user = await User.findOne({ email });
  if (!user) {
    //Same shape as a wrong code. An unknown address must not be
    //distinguishable from a known one with a bad code.
    throw new AppError(
      ErrorCode.OTP_NOT_FOUND,
      'That code is no longer valid. Please ask for a new one.'
    );
  }

  const { deviceId: issuedFor } = await verifyOtp({
    user: user._id,
    purpose: 'LOGIN',
    code,
  });

  //A code issued for one phone must not trust a different one. Without this
  //check, a code read off a victim's screen could be replayed from anywhere
  //to make the attacker's device permanently trusted.
  if (issuedFor && issuedFor !== deviceId) {
    throw new AppError(
      ErrorCode.OTP_NOT_FOUND,
      'That code was for a different device. Please sign in again.'
    );
  }

  await trustDevice({ user: user._id, deviceId, label: input.deviceLabel });

  logger.info('New device trusted', { email: redact(email) });
  return newSession(user);
};

//VERIFY THE SIGNUP CODE.
//
//Authenticated — the user is already inside the app when they do this.
export const verifyEmailOtp = async (input: {
  userId: string;
  code: string;
}): Promise<UserDocument> => {
  const code = assertOtpFormat(input.code);

  const user = await User.findById(input.userId);
  if (!user) throw new AppError(ErrorCode.ACCOUNT_NOT_FOUND, 'That account no longer exists.');

  //Idempotent. Tapping verify twice, or verifying on two devices, should not
  //fail with a confusing error.
  if (user.emailVerified) return user;

  await verifyOtp({ user: user._id, purpose: 'SIGNUP', code });

  user.emailVerified = true;
  user.emailVerifiedAt = new Date();
  await user.save();

  logger.info('Email verified', { email: redact(user.email) });
  return user;
};

export const resendEmailOtp = async (input: { userId: string; ip: string }): Promise<boolean> => {
  const user = await User.findById(input.userId);
  if (!user) throw new AppError(ErrorCode.ACCOUNT_NOT_FOUND, 'That account no longer exists.');
  if (user.emailVerified) return true;

  await deliver({ user, purpose: 'SIGNUP', ip: input.ip });
  return true;
};

export const resendLoginOtp = async (input: {
  email: string;
  deviceId: string;
  ip: string;
}): Promise<boolean> => {
  const email = normalizeEmail(input.email);
  const deviceId = assertDeviceId(input.deviceId);

  const user = await User.findOne({ email });
  //Silent success for an unknown address, for the same enumeration reason as
  //everywhere else. Nothing is sent.
  if (!user || !user.emailVerified) return true;

  await deliver({ user, purpose: 'LOGIN', ip: input.ip, deviceId });
  return true;
};

//PASSWORD RESET, STEP 1.
//
//Always returns true. An endpoint that says "no such account" is a free
//account-enumeration tool, so the response is identical whether or not the
//address exists, and whether or not anything was sent.
export const requestPasswordReset = async (input: {
  email: string;
  ip: string;
}): Promise<boolean> => {
  let email: string;
  try {
    email = normalizeEmail(input.email);
  } catch {
    //Even a malformed address returns true. A different answer for "not a
    //valid email" and "valid but unknown" is still a signal.
    return true;
  }

  const user = await User.findOne({ email });
  if (!user || !user.emailVerified) {
    logger.info('Reset requested for an unknown or unverified address', {
      email: redact(email),
    });
    return true;
  }

  try {
    await deliver({ user, purpose: 'RESET', ip: input.ip });
  } catch (error) {
    //A cooldown or hourly cap must not become a signal either. It is logged
    //and swallowed; the user sees the same "check your email" screen.
    logger.warn('Reset code not issued', {
      email: redact(email),
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return true;
};

//PASSWORD RESET, STEP 2.
//
//Trades a proven code for a short-lived ticket, so the code is not carried
//around and re-sent with the new password.
export const verifyPasswordResetOtp = async (input: {
  email: string;
  code: string;
}): Promise<{ resetToken: string; expiresAt: Date }> => {
  const email = normalizeEmail(input.email);
  const code = assertOtpFormat(input.code);

  const user = await User.findOne({ email });
  if (!user) {
    throw new AppError(
      ErrorCode.OTP_NOT_FOUND,
      'That code is no longer valid. Please ask for a new one.'
    );
  }

  await verifyOtp({ user: user._id, purpose: 'RESET', code });

  return {
    resetToken: signResetToken(user.id),
    expiresAt: new Date(Date.now() + env.RESET_TOKEN_MINUTES * 60_000),
  };
};

//PASSWORD RESET, STEP 3.
export const resetPassword = async (input: {
  resetToken: string;
  password: string;
  deviceId: string;
  deviceLabel?: string;
}): Promise<SessionResult> => {
  assertPassword(input.password);
  const deviceId = assertDeviceId(input.deviceId);
  const claims = verifyResetToken(input.resetToken);

  const user = await User.findById(claims.sub);
  if (!user) throw new AppError(ErrorCode.ACCOUNT_NOT_FOUND, 'That account no longer exists.');

  if (await bcrypt.compare(input.password, user.passwordHash)) {
    throw new AppError(
      ErrorCode.PASSWORD_UNCHANGED,
      'That is your current password. Please choose a different one.'
    );
  }

  user.passwordHash = await bcrypt.hash(input.password, PASSWORD_HASH_ROUNDS);
  //Revokes every token the account ever issued.
  user.tokenVersion += 1;
  user.failedPasswordAttempts = 0;
  await user.save();

  //Someone resetting because they think the account was taken should not leave
  //the other person's phone trusted. Everything goes, then this device alone
  //is trusted again.
  await revokeAllDevices(user._id);
  await trustDevice({ user: user._id, deviceId, label: input.deviceLabel });

  logger.info('Password reset', { email: redact(user.email) });
  //Logged straight in. Making someone reset a password and then immediately
  //type it again is friction with no security value.
  return newSession(user);
};

//CHANGE PASSWORD.
//
//Authenticated, current password required, no code — the session is already
//proof of possession.
export const changePassword = async (input: {
  userId: string;
  currentPassword: string;
  newPassword: string;
}): Promise<SessionResult> => {
  assertPassword(input.newPassword);

  const user = await User.findById(input.userId);
  if (!user) throw new AppError(ErrorCode.ACCOUNT_NOT_FOUND, 'That account no longer exists.');

  if (user.failedPasswordAttempts >= env.MAX_PASSWORD_ATTEMPTS) {
    throw new AppError(
      ErrorCode.PASSWORD_ATTEMPTS_EXCEEDED,
      'Too many incorrect attempts. Please reset your password by email instead.'
    );
  }

  if (!(await bcrypt.compare(input.currentPassword, user.passwordHash))) {
    user.failedPasswordAttempts += 1;
    await user.save();
    throw new AppError(ErrorCode.WRONG_PASSWORD, 'That is not your current password.', {
      meta: {
        attemptsLeft: Math.max(0, env.MAX_PASSWORD_ATTEMPTS - user.failedPasswordAttempts),
      },
    });
  }

  if (input.currentPassword === input.newPassword) {
    throw new AppError(
      ErrorCode.PASSWORD_UNCHANGED,
      'Your new password is the same as the old one.'
    );
  }

  user.passwordHash = await bcrypt.hash(input.newPassword, PASSWORD_HASH_ROUNDS);
  user.tokenVersion += 1;
  user.failedPasswordAttempts = 0;
  await user.save();

  //Trusted devices survive. Rotating a password you know is a different signal
  //from resetting one you lost.
  logger.info('Password changed', { email: redact(user.email) });
  return newSession(user);
};

//REFRESH.
//
//Extends the 7-day window without asking for the password, up to the 30-day
//cap on the original sign-in. The cap stops a session living forever; it is
//not a logout, because the current token keeps working until its own expiry.
export const refreshSession = async (input: {
  userId: string;
  origin: string;
}): Promise<SessionResult> => {
  if (sessionOriginExpired(input.origin)) {
    throw new AppError(
      ErrorCode.SESSION_EXPIRED,
      'Please sign in again to continue.'
    );
  }

  const user = await User.findById(input.userId);
  if (!user) throw new AppError(ErrorCode.ACCOUNT_NOT_FOUND, 'That account no longer exists.');

  //The original origin is carried forward, so refreshing does not reset the
  //30-day clock. That is the entire mechanism.
  return newSession(user, new Date(input.origin));
};

//LOGOUT.
//
//Bumps tokenVersion, which retires every token this account ever issued — not
//just the one presented. Signing out on a lost phone signs out everywhere,
//which is what people expect the button to mean.
export const logout = async (userId: string): Promise<boolean> => {
  await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
  return true;
};
