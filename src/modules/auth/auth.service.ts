import bcrypt from 'bcryptjs';
import { User, getUser, type IUser, type Identity, type Provider } from '../user/index.js';
import { env } from '../../config/env.js';
import { appError, ErrorCode } from '../../shared/errors.js';
import { hashPassword, passwordMatches, setPassword } from '../../shared/password.js';
import {
  normalizeEmail,
  tryNormalizeEmail,
  checkPassword,
  checkDeviceId,
  checkDeviceSecret,
  maskEmail,
  cleanText,
} from '../../shared/validation.js';
import { signToken, signResetToken, verifyResetToken, isSessionTooOld } from './token.service.js';
import { codeNotValid, sendCode, sendCodeBestEffort, verifyCode } from './otp.service.js';
import { isDeviceTrusted, trustDevice, touchDevice, revokeAllDevices } from './device.service.js';
import { Device } from './device.model.js';
import { Otp } from './otp.model.js';
import { minutesFromNow } from '../../shared/datetime.js';
import { createFailureCounter } from '../../shared/failures.js';
import {
  verifyGoogleToken,
  verifyAppleToken,
  linkDecision,
  sealedAppleRefreshToken,
  type ProviderClaims,
} from './identity.service.js';
import type {
  SignUpInput,
  LoginInput,
  ResetPasswordInput,
  ChangePasswordInput,
  GoogleSignInInput,
  AppleSignInInput,
  AuthPayload,
  LoginResult,
  ResetTicket,
  SignInOptions,
} from './auth.types.js';

const DUMMY_HASH = bcrypt.hashSync('imara-afya-timing-equaliser', 12);

//Wrong passwords allowed per email, from any IP, before login is locked for the window.
const LOGIN_FAILURES_MAX = 10;
const LOGIN_LOCK_MINUTES = 15;
const loginFailures = createFailureCounter(LOGIN_LOCK_MINUTES * 60_000, LOGIN_FAILURES_MAX);

const invalidCredentials = () =>
  appError(ErrorCode.INVALID_CREDENTIALS, 'That email or password is not right.');

const loginLocked = (retryAfterSeconds: number) => {
  const minutes = Math.ceil(retryAfterSeconds / 60);
  return appError(
    ErrorCode.RATE_LIMITED,
    `Too many incorrect passwords. Please try again in ${minutes} minutes, or reset your password.`,
    { reason: 'LOGIN_LOCKED', retryAfterSeconds, minutes }
  );
};

//Signs a session token for the device signed in with. origin is the time of the original sign-in.
const makeSession = (
  user: IUser,
  deviceId: string | undefined,
  origin = new Date()
): AuthPayload => ({
  token: signToken(String(user._id), user.tokenVersion, deviceId, origin),
  user,
});

//Creates an account and returns a session; the email is verified later.
export const signup = async (input: SignUpInput & { ip: string }): Promise<AuthPayload> => {
  const email = normalizeEmail(input.email);
  checkPassword(input.password);
  const deviceId = checkDeviceId(input.deviceId);
  const deviceSecret = checkDeviceSecret(input.deviceSecret);

  if (await User.exists({ email })) {
    throw appError(ErrorCode.EMAIL_TAKEN, 'That email address is already registered.');
  }

  const user = await User.create({
    email,
    passwordHash: await hashPassword(input.password),
    ...(input.language ? { language: input.language } : {}),
  });

  //If a later step fails, the account is removed again so the same email can sign up.
  try {
    await trustDevice({ userId: user._id, deviceId, deviceSecret, label: input.deviceLabel });
    await sendCodeBestEffort({ user, purpose: 'SIGNUP', ip: input.ip, skipCooldown: true });
    return makeSession(user, deviceId);
  } catch (error) {
    await Promise.all([
      User.deleteOne({ _id: user._id }),
      Device.deleteMany({ user: user._id }),
      Otp.deleteMany({ user: user._id }),
    ]).catch((cleanup) => console.error('[auth] could not undo failed signup:', cleanup));
    throw error;
  }
};

//A trusted device gets a token; any other device gets a code and no token.
export const login = async (input: LoginInput & { ip: string }): Promise<LoginResult> => {
  const email = normalizeEmail(input.email);
  const deviceId = checkDeviceId(input.deviceId);
  const deviceSecret = input.deviceSecret ? checkDeviceSecret(input.deviceSecret) : undefined;

  const user = await User.findOne({ email, deletedAt: null });

  //Once an email is locked, only its owner's trusted phone gets through, so an attacker
  //cannot lock the owner out. Unknown emails lock the same way, revealing nothing.
  const lockedFor = loginFailures.blockedFor(email);
  if (lockedFor > 0) {
    const trusted =
      !!user && !!deviceSecret && (await isDeviceTrusted(user._id, deviceId, deviceSecret));
    if (!trusted) throw loginLocked(lockedFor);
  }

  //Compares against a dummy hash so an unknown email, or an account without a password, takes
  //as long as a known one.
  if (!user || !user.passwordHash) {
    await bcrypt.compare(input.password, DUMMY_HASH);
    loginFailures.record(email);
    throw invalidCredentials();
  }
  if (!(await passwordMatches(user, input.password))) {
    loginFailures.record(email);
    throw invalidCredentials();
  }
  loginFailures.clear(email);

  if (deviceSecret && (await isDeviceTrusted(user._id, deviceId, deviceSecret))) {
    await touchDevice(user._id, deviceId);
    return makeSession(user, deviceId);
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

//Checks a login code for a new device, trusts the device and returns a session.
export const verifyLoginOtp = async (input: {
  email: string;
  code: string;
  deviceId: string;
  deviceSecret: string;
  deviceLabel?: string;
}): Promise<AuthPayload> => {
  const email = normalizeEmail(input.email);
  const deviceId = checkDeviceId(input.deviceId);
  const deviceSecret = checkDeviceSecret(input.deviceSecret);

  //An unknown email gets the same error as a wrong code.
  const user = await User.findOne({ email, deletedAt: null });
  if (!user) throw codeNotValid();

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

  await trustDevice({ userId: user._id, deviceId, deviceSecret, label: input.deviceLabel });

  return makeSession(user, deviceId);
};

//Marks the email verified once its signup code is right.
export const verifyEmailOtp = async (user: IUser, code: string): Promise<IUser> => {
  if (user.emailVerified) return user;

  await verifyCode({ userId: user._id, purpose: 'SIGNUP', code });

  user.emailVerified = true;
  user.emailVerifiedAt = new Date();
  await user.save();

  return user;
};

//Sends a new signup code unless the email is already verified.
export const resendEmailOtp = async (user: IUser, ip: string): Promise<boolean> => {
  if (!user.emailVerified) await sendCode({ user, purpose: 'SIGNUP', ip });
  return true;
};

//Sends a new login code; returns true whether or not the account exists.
export const resendLoginOtp = async (
  email: string,
  deviceId: string,
  ip: string
): Promise<boolean> => {
  const normalized = normalizeEmail(email);
  const device = checkDeviceId(deviceId);

  const user = await User.findOne({ email: normalized, deletedAt: null });
  if (!user || !user.emailVerified) return true;

  await sendCode({ user, purpose: 'LOGIN', ip, deviceId: device });
  return true;
};

//Emails a reset code. Always returns true, whether or not the account exists.
export const requestPasswordReset = async (email: string, ip: string): Promise<boolean> => {
  const normalized = tryNormalizeEmail(email);
  if (!normalized) return true;

  const user = await User.findOne({ email: normalized, deletedAt: null });
  if (!user || !user.emailVerified) return true;

  try {
    await sendCode({ user, purpose: 'RESET', ip });
  } catch (error) {
    console.warn('[auth] reset code not sent:', error);
  }

  return true;
};

//Swaps a correct reset code for a short-lived reset token.
export const verifyPasswordResetOtp = async (email: string, code: string): Promise<ResetTicket> => {
  const user = await User.findOne({ email: normalizeEmail(email), deletedAt: null });
  if (!user) throw codeNotValid();

  await verifyCode({ userId: user._id, purpose: 'RESET', code });

  return {
    resetToken: signResetToken(String(user._id), user.tokenVersion),
    expiresAt: minutesFromNow(env.RESET_TOKEN_MINUTES),
  };
};

//Sets a new password from a reset token, signs out every device and trusts this one.
export const resetPassword = async (input: ResetPasswordInput): Promise<AuthPayload> => {
  checkPassword(input.password);
  const deviceId = checkDeviceId(input.deviceId);
  const deviceSecret = checkDeviceSecret(input.deviceSecret);

  const ticket = verifyResetToken(input.resetToken);
  const user = await getUser(ticket.userId);

  //Rejects a reset ticket that has already been used.
  if (ticket.tokenVersion !== user.tokenVersion) {
    throw appError(
      ErrorCode.INVALID_RESET_TOKEN,
      'That reset request has already been used. Please start again.',
      { reason: 'USED' }
    );
  }

  if (await passwordMatches(user, input.password)) {
    throw appError(
      ErrorCode.PASSWORD_UNCHANGED,
      'That is your current password. Please choose a different one.'
    );
  }

  await setPassword(user, input.password);

  //Revokes all trusted devices, then trusts this one.
  await revokeAllDevices(user._id);
  await trustDevice({ userId: user._id, deviceId, deviceSecret, label: input.deviceLabel });

  return makeSession(user, deviceId);
};

//Changes the password after checking the current one; locks after too many wrong tries.
export const changePassword = async (
  user: IUser,
  input: ChangePasswordInput,
  deviceId: string | undefined
): Promise<AuthPayload> => {
  checkPassword(input.newPassword);

  if (!user.passwordHash) {
    throw appError(
      ErrorCode.WRONG_PASSWORD,
      'This account has no password yet. Use “Forgot password” to set one.',
      { reason: 'NO_PASSWORD' }
    );
  }

  if (user.failedPasswordAttempts >= env.MAX_PASSWORD_ATTEMPTS) {
    throw appError(
      ErrorCode.PASSWORD_ATTEMPTS_EXCEEDED,
      'Too many incorrect attempts. Please reset your password by email instead.'
    );
  }

  if (!(await passwordMatches(user, input.currentPassword))) {
    user.failedPasswordAttempts += 1;
    await user.save();
    throw appError(ErrorCode.WRONG_PASSWORD, 'That is not your current password.', {
      attemptsLeft: Math.max(0, env.MAX_PASSWORD_ATTEMPTS - user.failedPasswordAttempts),
    });
  }

  if (input.currentPassword === input.newPassword) {
    throw appError(ErrorCode.PASSWORD_UNCHANGED, 'Your new password is the same as the old one.');
  }

  await setPassword(user, input.newPassword);
  return makeSession(user, deviceId);
};

//A new token with the same sign-in time and device, until that sign-in is MAX_SESSION_DAYS old.
export const refreshSession = (
  user: IUser,
  origin: string | undefined,
  deviceId: string | undefined
): AuthPayload => {
  if (!origin || isSessionTooOld(origin)) {
    throw appError(ErrorCode.SESSION_EXPIRED, 'Please sign in again to continue.');
  }
  return makeSession(user, deviceId, new Date(origin));
};

//A checked Google or Apple sign-in with the device it came from.
interface ProviderSignIn {
  provider: Provider;
  claims: ProviderClaims;
  deviceId: string;
  deviceSecret: string;
  deviceLabel?: string;
  language?: IUser['language'];
  name: string;
  appleRefreshToken?: string | null;
  ip: string;
}

//Name from the provider, or '' when it is unusable.
const providerName = (raw: string): string => {
  try {
    return cleanText(raw, 80, 'name');
  } catch {
    return '';
  }
};

//Finds the account by its provider identity, links it by verified email, or creates it.
const signInWithProvider = async (p: ProviderSignIn): Promise<AuthPayload> => {
  const trustThisDevice = (user: IUser) =>
    trustDevice({
      userId: user._id,
      deviceId: p.deviceId,
      deviceSecret: p.deviceSecret,
      label: p.deviceLabel,
    });

  const known = await User.findOne({
    identities: { $elemMatch: { provider: p.provider, subject: p.claims.subject } },
    deletedAt: null,
  });
  if (known) {
    await trustThisDevice(known);
    return makeSession(known, p.deviceId);
  }

  const email = tryNormalizeEmail(p.claims.email);
  if (!email) throw appError(ErrorCode.PROVIDER_TOKEN_INVALID, 'That sign-in did not work.');

  const identity: Identity = {
    provider: p.provider,
    subject: p.claims.subject,
    email,
    linkedAt: new Date(),
    appleRefreshToken: p.appleRefreshToken ?? null,
  };
  const name = providerName(p.name);

  const owner = await User.findOne({ email });
  if (owner) {
    if (owner.deletedAt || linkDecision(p.claims.emailVerified, owner.emailVerified) !== 'link') {
      throw appError(
        ErrorCode.ACCOUNT_EXISTS,
        'An account with this email already exists. Please sign in with your email and password.'
      );
    }
    owner.identities.push(identity);
    if (!owner.name && name) owner.name = name;
    await owner.save();
    await trustThisDevice(owner);
    return makeSession(owner, p.deviceId);
  }

  const user = await User.create({
    email,
    passwordHash: null,
    emailVerified: p.claims.emailVerified,
    emailVerifiedAt: p.claims.emailVerified ? new Date() : null,
    name,
    identities: [identity],
    ...(p.language ? { language: p.language } : {}),
  });

  //If a later step fails, the account is removed again, as in signup.
  try {
    await trustThisDevice(user);
    if (!user.emailVerified) {
      await sendCodeBestEffort({ user, purpose: 'SIGNUP', ip: p.ip, skipCooldown: true });
    }
    return { ...makeSession(user, p.deviceId), newAccount: true };
  } catch (error) {
    await Promise.all([
      User.deleteOne({ _id: user._id }),
      Device.deleteMany({ user: user._id }),
      Otp.deleteMany({ user: user._id }),
    ]).catch((cleanup) => console.error('[auth] could not undo failed sign-in:', cleanup));
    throw error;
  }
};

//The provider settings the app needs before anyone signs in.
export const signInOptions = (): SignInOptions => ({
  googleWebClientId: env.GOOGLE_WEB_CLIENT_ID || null,
  googleIosClientId: env.GOOGLE_IOS_CLIENT_ID || null,
});

//Signs in, links or creates an account from a Google ID token.
export const signInWithGoogle = async (
  input: GoogleSignInInput & { ip: string }
): Promise<AuthPayload> => {
  if (!env.GOOGLE_WEB_CLIENT_ID) {
    throw appError(
      ErrorCode.PROVIDER_NOT_CONFIGURED,
      'This way of signing in is not available yet. Please use your email.'
    );
  }
  const deviceId = checkDeviceId(input.deviceId);
  const deviceSecret = checkDeviceSecret(input.deviceSecret);
  const claims = await verifyGoogleToken(input.idToken);

  return signInWithProvider({
    provider: 'google',
    claims,
    deviceId,
    deviceSecret,
    deviceLabel: input.deviceLabel,
    language: input.language,
    name: claims.name,
    ip: input.ip,
  });
};

//Signs in, links or creates an account from a Sign in with Apple identity token.
export const signInWithApple = async (
  input: AppleSignInInput & { ip: string }
): Promise<AuthPayload> => {
  const deviceId = checkDeviceId(input.deviceId);
  const deviceSecret = checkDeviceSecret(input.deviceSecret);
  const claims = await verifyAppleToken(input.identityToken, input.nonce);

  return signInWithProvider({
    provider: 'apple',
    claims,
    deviceId,
    deviceSecret,
    deviceLabel: input.deviceLabel,
    language: input.language,
    name: [input.givenName, input.familyName].filter(Boolean).join(' '),
    appleRefreshToken: await sealedAppleRefreshToken(input.authorizationCode),
    ip: input.ip,
  });
};

//Bumping tokenVersion signs out every device, not just this one.
export const logout = async (user: IUser): Promise<boolean> => {
  await User.updateOne({ _id: user._id }, { $inc: { tokenVersion: 1 } });
  return true;
};
