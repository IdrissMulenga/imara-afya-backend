import { PASSWORD } from '../../config/constants.js';
import { AppError } from '../../core/errors/AppError.js';
import { ErrorCode } from '../../core/errors/codes.js';
import { isValidTimezone } from './datetime.js';

//FIELD VALIDATION, SERVER SIDE.
//
//The app validates too. That is a courtesy to the user, not a control: curl
//bypasses the app entirely, so every rule that matters is enforced here.
//
//These functions throw AppError and know nothing about GraphQL.

//Deliberately permissive. Strict RFC 5322 rejects addresses that work, and the
//only real proof an address exists is that a code sent to it comes back.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

//Control characters, stripped from anything a user typed so a label cannot
//break a log line or a rendered list.
const CONTROL_CHARS = new RegExp('[\\x00-\\x1F\\x7F]', 'g');

export const normalizeEmail = (raw: string): string => {
  const email = raw.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    throw new AppError(ErrorCode.INVALID_EMAIL, 'That email address does not look right.');
  }
  return email;
};

export const assertPassword = (password: string): void => {
  if (password.length < PASSWORD.MIN_LENGTH) {
    throw new AppError(
      ErrorCode.WEAK_PASSWORD,
      `Your password needs at least ${PASSWORD.MIN_LENGTH} characters.`
    );
  }
  if (password.length > PASSWORD.MAX_LENGTH) {
    //bcrypt silently truncates past 72 bytes; a very long password is also a
    //cheap way to make the server burn CPU hashing it.
    throw new AppError(ErrorCode.WEAK_PASSWORD, 'That password is too long.');
  }
  //No composition rules beyond length. Requiring a symbol and a digit pushes
  //people towards "Password1!" and towards writing it down; length is what
  //actually costs an attacker anything.
  if (/^\s+$/.test(password)) {
    throw new AppError(ErrorCode.WEAK_PASSWORD, 'Your password cannot be only spaces.');
  }
};

//Six digits, nothing else. Rejecting the shape before touching the database
//keeps a malformed guess from spending one of the five real attempts.
export const assertOtpFormat = (code: string): string => {
  const trimmed = code.trim();
  if (!/^\d{6}$/.test(trimmed)) {
    throw new AppError(ErrorCode.OTP_INCORRECT, 'That code is not right.');
  }
  return trimmed;
};

//The device identifier is opaque to us — it decides whether a code is needed,
//it does not grant anything. We only bound its shape so it cannot be used to
//push arbitrary payloads into an index.
export const assertDeviceId = (deviceId: string): string => {
  const trimmed = deviceId.trim();
  if (trimmed.length < 8 || trimmed.length > 128 || !/^[\w-]+$/.test(trimmed)) {
    throw new AppError(ErrorCode.INVALID_DEVICE_ID, 'That device identifier is not valid.');
  }
  return trimmed;
};

export const assertTimezone = (timezone: string): string => {
  const trimmed = timezone.trim();
  if (!isValidTimezone(trimmed)) {
    throw new AppError(ErrorCode.BAD_USER_INPUT, 'That timezone is not recognised.');
  }
  return trimmed;
};

//Free text the user typed: a device label, a note, a name.
export const cleanText = (raw: string, maxLength: number, fieldLabel: string): string => {
  const text = raw.replace(CONTROL_CHARS, '').trim();
  if (text.length > maxLength) {
    throw new AppError(ErrorCode.BAD_USER_INPUT, `${fieldLabel} is too long.`);
  }
  return text;
};

//Show enough of an address for the user to know which inbox to open, and not
//enough for an attacker to learn one they did not already have.
export const maskEmail = (email: string): string => {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const name = email.slice(0, at);
  const domain = email.slice(at);
  if (name.length <= 2) return `${name[0]}***${domain}`;
  return `${name[0]}${'*'.repeat(Math.min(name.length - 2, 4))}${name.at(-1)}${domain}`;
};
