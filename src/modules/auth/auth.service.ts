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

//THE AUTH FLOWS.
//
//Each function is one thing a user can do. Resolvers call these; they contain
//no logic of their own.

const PASSWORD_ROUNDS = 12;

//A hash to compare against when no user was found. See the note in login().
const DUMMY_HASH = bcrypt.hashSync('imara-afya-timing-equaliser', PASSWORD_ROUNDS);

//Used by nine flows. Having it once means the message and code cannot drift
//apart between them.
const findUserOrThrow = async (id: string): Promise<IUser> => {
  const user = await User.findById(id);
  if (!user) throw appError(ErrorCode.ACCOUNT_NOT_FOUND, 'That account no longer exists.');
  return user;
};

//`origin` defaults to now (a fresh sign-in). refreshSession passes the
//ORIGINAL origin forward, which is what stops renewing from resetting the
//30-day clock.
const makeSession = (user: IUser, origin = new Date()): AuthPayload => ({
  token: signToken(String(user._id), user.tokenVersion, origin),
  user,
});

//SIGN UP.
//
//Returns a working session straight away. Verification happens afterwards from
//inside the app — a user who cannot log a glass of water on day one does not
//come back on day two. The one thing an unverified account cannot do is
//recover itself, because sending a recovery code to an unproven address is how
//an account gets handed to a typo.
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
  });

  //The signing-up phone is trusted from the start. Asking for a code on the
  //device that just created the account proves nothing.
  await trustDevice({ userId: user._id, deviceId, label: input.deviceLabel });

  await sendCodeBestEffort({ user, purpose: 'SIGNUP', ip: input.ip, skipCooldown: true });

  return makeSession(user);
};

//LOG IN.
//
//A trusted phone gets a token. Anything else gets a code and NO token.
export const login = async (input: LoginInput & { ip: string }): Promise<LoginResult> => {
  const email = normalizeEmail(input.email);
  const deviceId = checkDeviceId(input.deviceId);

  const user = await User.findOne({ email });

  //TIMING SAFETY — do not "optimise" this away.
  //
  //If we returned early when no user was found, an unknown email would answer
  //in ~1ms while a known one takes the ~100ms bcrypt costs. That gap tells an
  //attacker which addresses have accounts. So a comparison runs either way.
  if (!user) {
    await bcrypt.compare(input.password, DUMMY_HASH);
    throw appError(ErrorCode.INVALID_CREDENTIALS, 'That email or password is not right.');
  }

  if (!(await bcrypt.compare(input.password, user.passwordHash))) {
    //Same message as above, on purpose. "No account with that email" is a free
    //account-enumeration tool.
    throw appError(ErrorCode.INVALID_CREDENTIALS, 'That email or password is not right.');
  }

  if (await isDeviceTrusted(user._id, deviceId)) {
    await touchDevice(user._id, deviceId);
    return makeSession(user);
  }

  //An unverified address cannot receive a login code — we have no evidence it
  //belongs to this person. They can still sign in from the phone they signed
  //up on, and verify from there.
  if (!user.emailVerified) {
    throw appError(
      ErrorCode.EMAIL_NOT_VERIFIED,
      'Please confirm your email address from the device you signed up on first.'
    );
  }

  const expiresAt = await sendCode({ user, purpose: 'LOGIN', ip: input.ip, deviceId });

  return { challenge: true, purpose: 'LOGIN', expiresAt, maskedEmail: maskEmail(user.email) };
};

//FINISH SIGNING IN FROM A NEW PHONE.
export const verifyLoginOtp = async (input: {
  email: string;
  code: string;
  deviceId: string;
  deviceLabel?: string;
}): Promise<AuthPayload> => {
  const email = normalizeEmail(input.email);
  const deviceId = checkDeviceId(input.deviceId);

  const user = await User.findOne({ email });

  //Same error as a wrong code — an unknown address must not look different
  //from a known one with a bad code.
  if (!user) {
    throw appError(ErrorCode.OTP_NOT_FOUND, 'That code is no longer valid. Please ask for a new one.');
  }

  const { deviceId: issuedFor } = await verifyCode({ userId: user._id, purpose: 'LOGIN', code: input.code });

  //A code issued for one phone must not trust a different one. Without this, a
  //code read off someone's screen could be replayed from another device to
  //make the attacker's phone permanently trusted.
  if (issuedFor && issuedFor !== deviceId) {
    throw appError(ErrorCode.OTP_NOT_FOUND, 'That code was for a different device. Please sign in again.');
  }

  await trustDevice({ userId: user._id, deviceId, label: input.deviceLabel });

  return makeSession(user);
};

//CONFIRM THE SIGNUP ADDRESS. Authenticated — the user is inside the app.
export const verifyEmailOtp = async (userId: string, code: string): Promise<IUser> => {
  const user = await findUserOrThrow(userId);

  //Idempotent. Tapping verify twice should not produce a confusing error.
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

export const resendLoginOtp = async (email: string, deviceId: string, ip: string): Promise<boolean> => {
  const normalized = normalizeEmail(email);
  const device = checkDeviceId(deviceId);

  const user = await User.findOne({ email: normalized });
  //Silent success for unknown or unverified — nothing is sent.
  if (!user || !user.emailVerified) return true;

  await sendCode({ user, purpose: 'LOGIN', ip, deviceId: device });
  return true;
};

//PASSWORD RESET, STEP 1.
//
//ALWAYS returns true — for a bad address, an unknown one, an unverified one,
//and a real one. Any difference between those is a signal an attacker can use
//to find out which addresses have accounts. Failures are logged, not thrown.
export const requestPasswordReset = async (email: string, ip: string): Promise<boolean> => {
  const normalized = tryNormalizeEmail(email);
  if (!normalized) return true;

  const user = await User.findOne({ email: normalized });
  if (!user || !user.emailVerified) return true;

  try {
    await sendCode({ user, purpose: 'RESET', ip });
  } catch (error) {
    //A cooldown or a dead mail provider must not become a signal either.
    console.warn('[auth] reset code not sent:', error);
  }

  return true;
};

//PASSWORD RESET, STEP 2. Trades a proven code for a short-lived ticket, so the
//code is not carried around and re-sent with the new password.
export const verifyPasswordResetOtp = async (email: string, code: string): Promise<ResetTicket> => {
  const normalized = normalizeEmail(email);
  const user = await User.findOne({ email: normalized });

  if (!user) {
    throw appError(ErrorCode.OTP_NOT_FOUND, 'That code is no longer valid. Please ask for a new one.');
  }

  await verifyCode({ userId: user._id, purpose: 'RESET', code });

  return {
    resetToken: signResetToken(String(user._id)),
    expiresAt: minutesFromNow(env.RESET_TOKEN_MINUTES),
  };
};

//PASSWORD RESET, STEP 3.
export const resetPassword = async (input: ResetPasswordInput): Promise<AuthPayload> => {
  checkPassword(input.password);
  const deviceId = checkDeviceId(input.deviceId);

  //Rejects a session token presented here — the ticket carries a purpose claim
  //that this checks.
  const userId = verifyResetToken(input.resetToken);
  const user = await findUserOrThrow(userId);

  if (await bcrypt.compare(input.password, user.passwordHash)) {
    throw appError(ErrorCode.PASSWORD_UNCHANGED, 'That is your current password. Please choose a different one.');
  }

  user.passwordHash = await bcrypt.hash(input.password, PASSWORD_ROUNDS);
  //Retires every token this account ever issued.
  user.tokenVersion += 1;
  user.failedPasswordAttempts = 0;
  await user.save();

  //Someone resetting because they think the account was taken should not leave
  //the other person's phone trusted. Everything goes, then this device alone
  //is trusted again.
  await revokeAllDevices(user._id);
  await trustDevice({ userId: user._id, deviceId, label: input.deviceLabel });

  //Logged straight in — making someone reset a password then immediately type
  //it again is friction with no security value.
  return makeSession(user);
};

//CHANGE PASSWORD. Authenticated, current password required, no code — the
//session is already proof of possession.
export const changePassword = async (userId: string, input: ChangePasswordInput): Promise<AuthPayload> => {
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

  //Trusted devices survive. Rotating a password you know is a different signal
  //from resetting one you lost.
  return makeSession(user);
};

//REFRESH. Extends the window without the password, up to the 30-day cap on the
//original sign-in.
export const refreshSession = async (userId: string, origin: string): Promise<AuthPayload> => {
  if (isSessionTooOld(origin)) {
    throw appError(ErrorCode.SESSION_EXPIRED, 'Please sign in again to continue.');
  }
  const user = await findUserOrThrow(userId);
  //The ORIGINAL origin goes forward, so refreshing does not reset the clock.
  return makeSession(user, new Date(origin));
};

//LOG OUT. Bumps tokenVersion, retiring every token this account issued — not
//just the one presented. Signing out on a lost phone signs out everywhere,
//which is what people expect the button to mean.
export const logout = async (userId: string): Promise<boolean> => {
  await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
  return true;
};

