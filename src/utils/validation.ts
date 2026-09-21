import { appError, ErrorCode } from './errors.js';

//INPUT CHECKS.
//
//The app validates too, but that is a courtesy to the user, not a control —
//curl bypasses the app entirely. Every rule that matters is enforced here.

//Deliberately loose. Strict RFC 5322 rejects addresses that work, and the only
//real proof an address exists is that a code sent to it comes back.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CONTROL_CHARS = new RegExp('[\\x00-\\x1F\\x7F]', 'g');

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

//Trims and lowercases, then checks. Returning the cleaned value means callers
//always store the same form — two accounts cannot differ only by capitals.
export const normalizeEmail = (raw: string): string => {
  const email = raw.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    throw appError(ErrorCode.INVALID_EMAIL, 'That email address does not look right.');
  }
  return email;
};

//Same, but returns null instead of throwing. Password reset needs this: it has
//to answer identically for a bad address and an unknown one, because any
//difference tells an attacker which addresses have accounts.
export const tryNormalizeEmail = (raw: string): string | null => {
  try {
    return normalizeEmail(raw);
  } catch {
    return null;
  }
};

export const checkPassword = (password: string): void => {
  if (password.length < PASSWORD_MIN) {
    throw appError(ErrorCode.WEAK_PASSWORD, `Your password needs at least ${PASSWORD_MIN} characters.`);
  }
  //bcrypt silently ignores anything past 72 bytes, and a very long password is
  //a cheap way to make the server burn CPU hashing it.
  if (password.length > PASSWORD_MAX) {
    throw appError(ErrorCode.WEAK_PASSWORD, 'That password is too long.');
  }
  //No "must contain a symbol" rule. That pushes people towards "Password1!"
  //and towards writing it down; length is what actually costs an attacker.
  if (/^\s+$/.test(password)) {
    throw appError(ErrorCode.WEAK_PASSWORD, 'Your password cannot be only spaces.');
  }
};

//Checking the shape first means a malformed guess does not spend one of the
//five real attempts.
export const checkOtpCode = (code: string): string => {
  const trimmed = code.trim();
  if (!/^\d{6}$/.test(trimmed)) {
    throw appError(ErrorCode.OTP_INCORRECT, 'That code is not right.');
  }
  return trimmed;
};

//We only bound the shape so it cannot be used to push junk into an index.
export const checkDeviceId = (deviceId: string): string => {
  const trimmed = deviceId.trim();
  if (trimmed.length < 8 || trimmed.length > 128 || !/^[\w-]+$/.test(trimmed)) {
    throw appError(ErrorCode.INVALID_DEVICE_ID, 'That device identifier is not valid.');
  }
  return trimmed;
};

//An invalid timezone would throw inside Intl on every read afterwards, turning
//one bad write into a permanently broken account.
export const checkTimezone = (timezone: string): string => {
  const trimmed = timezone.trim();
  try {
    new Intl.DateTimeFormat('en', { timeZone: trimmed });
    return trimmed;
  } catch {
    throw appError(ErrorCode.BAD_USER_INPUT, 'That timezone is not recognised.');
  }
};

//Strips control characters so a label cannot break a log line or a list.
export const cleanText = (raw: string, maxLength: number, label: string): string => {
  const text = raw.replace(CONTROL_CHARS, '').trim();
  if (text.length > maxLength) {
    throw appError(ErrorCode.BAD_USER_INPUT, `${label} is too long.`);
  }
  return text;
};

//Enough for the user to know which inbox to check, not enough for an attacker
//to learn an address. 1mulengaidriss@gmail.com -> 1****s@gmail.com
export const maskEmail = (email: string): string => {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const name = email.slice(0, at);
  const domain = email.slice(at);
  if (name.length <= 2) return `${name[0]}***${domain}`;
  return `${name[0]}${'*'.repeat(Math.min(name.length - 2, 4))}${name.at(-1)}${domain}`;
};
