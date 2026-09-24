import bcrypt from 'bcryptjs';
import { User, type IUser } from '../user/user.model.js';
import { env } from '../../config/env.js';
import { appError, ErrorCode } from '../../shared/errors.js';
import {
  normalizeEmail,
  tryNormalizeEmail,
  checkPassword,
  checkDeviceId,
  maskEmail,
} from '../../shared/validation.js';
import { signToken, signResetToken, verifyResetToken, isSessionTooOld } from './token.service.js';
import { sendCode, sendCodeBestEffort, verifyCode } from './otp.service.js';
import { isDeviceTrusted, trustDevice, touchDevice, revokeAllDevices } from './device.service.js';
import { minutesFromNow } from '../../shared/datetime.js';
import type {
  SignUpInput,
  LoginInput,
  ResetPasswordInput,
  ChangePasswordInput,
  AuthPayload,
  LoginResult,
  ResetTicket,
} from './auth.types.js';

const PASSWORD_ROUNDS = 12;

const DUMMY_HASH = bcrypt.hashSync('imara-afya-timing-equaliser', PASSWORD_ROUNDS);

const findUserOrThrow = async (id: string): Promise<IUser> => {
  const user = await User.findById(id);
  if (!user) throw appError(ErrorCode.ACCOUNT_NOT_FOUND, 'That account no longer exists.');
  return user;
};

//Signs a session token. origin is the time of the original sign-in.
const makeSession = (user: IUser, origin = new Date()): AuthPayload => ({
  token: signToken(String(user._id), user.tokenVersion, origin),
  user,
});

//Creates an account and returns a session; the email is verified later.
export const signup = async (input: SignUpInput & { ip: string }): Promise<AuthPayload> => {
  const email = normalizeEmail(input.email);
  checkPassword(input.password);
  const deviceId = checkDeviceId(input.deviceId);

  if (await User.exists({ email })) {
    throw appError(ErrorCode.EMAIL_TAKEN, 'That email address is already registered.');
  }

  const user = await User.create({
    email,
    passwordHash: await bcrypt.hash(input.password, PASSWORD_ROUNDS),
    ...(input.language ? { language: input.language } : {}),
  });

  await trustDevice({ userId: user._id, deviceId, label: input.deviceLabel });

  await sendCodeBestEffort({ user, purpose: 'SIGNUP', ip: input.ip, skipCooldown: true });

  return makeSession(user);
};

//A trusted device gets a token; any other device gets a code and no token.
export const login = async (input: LoginInput & { ip: string }): Promise<LoginResult> => {
  const email = normalizeEmail(input.email);
  const deviceId = checkDeviceId(input.deviceId);

  const user = await User.findOne({ email });

  //Compares against a dummy hash so an unknown email takes as long as a known one.
  if (!user) {
    await bcrypt.compare(input.password, DUMMY_HASH);
    throw appError(ErrorCode.INVALID_CREDENTIALS, 'That email or password is not right.');
  }

  if (!(await bcrypt.compare(input.password, user.passwordHash))) {
    throw appError(ErrorCode.INVALID_CREDENTIALS, 'That email or password is not right.');
  }

  if (await isDeviceTrusted(user._id, deviceId)) {
    await touchDevice(user._id, deviceId);
    return makeSession(user);
  }

  //Unverified addresses cannot receive login codes.
  if (!user.emailVerified) {
    throw appError(
      ErrorCode.EMAIL_NOT_VERIFIED,
      'Please confirm your email address from the device you signed up on first.'
    );
  }

  const expiresAt = await sendCode({ user, purpose: 'LOGIN', ip: input.ip, deviceId });

  return { challenge: true, purpose: 'LOGIN', expiresAt, maskedEmail: maskEmail(user.email) };
};

export const verifyLoginOtp = async (input: {
  email: string;
  code: string;
  deviceId: string;
  deviceLabel?: string;
}): Promise<AuthPayload> => {
  const email = normalizeEmail(input.email);
  const deviceId = checkDeviceId(input.deviceId);

  const user = await User.findOne({ email });

  //An unknown email gets the same error as a wrong code.
  if (!user) {
    throw appError(
      ErrorCode.OTP_NOT_FOUND,
      'That code is no longer valid. Please ask for a new one.'
    );
  }

  const { deviceId: issuedFor } = await verifyCode({
    userId: user._id,
    purpose: 'LOGIN',
    code: input.code,
  });

  //Rejects a code that was issued for a different device.
  if (issuedFor && issuedFor !== deviceId) {
    throw appError(
      ErrorCode.OTP_NOT_FOUND,
      'That code was for a different device. Please sign in again.',
      { reason: 'OTHER_DEVICE' }
    );
  }

  await trustDevice({ userId: user._id, deviceId, label: input.deviceLabel });

  return makeSession(user);
};

export const verifyEmailOtp = async (userId: string, code: string): Promise<IUser> => {
  const user = await findUserOrThrow(userId);

  if (user.emailVerified) return user;

  await verifyCode({ userId: user._id, purpose: 'SIGNUP', code });

  user.emailVerified = true;
  user.emailVerifiedAt = new Date();
  await user.save();

  return user;
};

export const resendEmailOtp = async (userId: string, ip: string): Promise<boolean> => {
  const user = await findUserOrThrow(userId);
  if (user.emailVerified) return true;
  await sendCode({ user, purpose: 'SIGNUP', ip });
  return true;
};

export const resendLoginOtp = async (
  email: string,
  deviceId: string,
  ip: string
): Promise<boolean> => {
  const normalized = normalizeEmail(email);
  const device = checkDeviceId(deviceId);

  const user = await User.findOne({ email: normalized });
  if (!user || !user.emailVerified) return true;

  await sendCode({ user, purpose: 'LOGIN', ip, deviceId: device });
  return true;
};

//Emails a reset code. Always returns true, whether or not the account exists.
export const requestPasswordReset = async (email: string, ip: string): Promise<boolean> => {
  const normalized = tryNormalizeEmail(email);
  if (!normalized) return true;

  const user = await User.findOne({ email: normalized });
  if (!user || !user.emailVerified) return true;

  try {
    await sendCode({ user, purpose: 'RESET', ip });
  } catch (error) {
    console.warn('[auth] reset code not sent:', error);
  }

  return true;
};

export const verifyPasswordResetOtp = async (email: string, code: string): Promise<ResetTicket> => {
  const normalized = normalizeEmail(email);
  const user = await User.findOne({ email: normalized });

  if (!user) {
    throw appError(
      ErrorCode.OTP_NOT_FOUND,
      'That code is no longer valid. Please ask for a new one.'
    );
  }

  await verifyCode({ userId: user._id, purpose: 'RESET', code });

  return {
    resetToken: signResetToken(String(user._id), user.tokenVersion),
    expiresAt: minutesFromNow(env.RESET_TOKEN_MINUTES),
  };
};

export const resetPassword = async (input: ResetPasswordInput): Promise<AuthPayload> => {
  checkPassword(input.password);
  const deviceId = checkDeviceId(input.deviceId);

  const ticket = verifyResetToken(input.resetToken);
  const user = await findUserOrThrow(ticket.userId);

  //Rejects a reset ticket that has already been used.
  if (ticket.tokenVersion !== user.tokenVersion) {
    throw appError(
      ErrorCode.INVALID_RESET_TOKEN,
      'That reset request has already been used. Please start again.',
      { reason: 'USED' }
    );
  }

  if (await bcrypt.compare(input.password, user.passwordHash)) {
    throw appError(
      ErrorCode.PASSWORD_UNCHANGED,
      'That is your current password. Please choose a different one.'
    );
  }

  user.passwordHash = await bcrypt.hash(input.password, PASSWORD_ROUNDS);
  user.tokenVersion += 1;
  user.failedPasswordAttempts = 0;
  await user.save();

  //Revokes all trusted devices, then trusts this one.
  await revokeAllDevices(user._id);
  await trustDevice({ userId: user._id, deviceId, label: input.deviceLabel });

  return makeSession(user);
};

export const changePassword = async (
  userId: string,
  input: ChangePasswordInput
): Promise<AuthPayload> => {
  checkPassword(input.newPassword);
  const user = await findUserOrThrow(userId);

  if (user.failedPasswordAttempts >= env.MAX_PASSWORD_ATTEMPTS) {
    throw appError(
      ErrorCode.PASSWORD_ATTEMPTS_EXCEEDED,
      'Too many incorrect attempts. Please reset your password by email instead.'
    );
  }

  if (!(await bcrypt.compare(input.currentPassword, user.passwordHash))) {
    user.failedPasswordAttempts += 1;
    await user.save();
    throw appError(ErrorCode.WRONG_PASSWORD, 'That is not your current password.', {
      attemptsLeft: Math.max(0, env.MAX_PASSWORD_ATTEMPTS - user.failedPasswordAttempts),
    });
  }

  if (input.currentPassword === input.newPassword) {
    throw appError(ErrorCode.PASSWORD_UNCHANGED, 'Your new password is the same as the old one.');
  }

  user.passwordHash = await bcrypt.hash(input.newPassword, PASSWORD_ROUNDS);
  user.tokenVersion += 1;
  user.failedPasswordAttempts = 0;
  await user.save();

  return makeSession(user);
};

export const refreshSession = async (userId: string, origin: string): Promise<AuthPayload> => {
  if (isSessionTooOld(origin)) {
    throw appError(ErrorCode.SESSION_EXPIRED, 'Please sign in again to continue.');
  }
  const user = await findUserOrThrow(userId);
  return makeSession(user, new Date(origin));
};

//Bumping tokenVersion signs out every device, not just this one.
export const logout = async (userId: string): Promise<boolean> => {
  await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
  return true;
};
