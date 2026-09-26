import { appError, ErrorCode } from './errors.js';
import { fieldName, type Field } from './messages.js';
import { addDays, dayInZone, daysBetween } from './datetime.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CONTROL_CHARS = new RegExp('[\\x00-\\x1F\\x7F]', 'g');

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

//Throws OUT_OF_RANGE unless value is a finite number within [min, max].
export const inRange = (value: number, min: number, max: number, field: Field): number => {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw appError(ErrorCode.BAD_USER_INPUT, `${fieldName(field)} is out of range.`, {
      reason: 'OUT_OF_RANGE',
      field,
    });
  }
  return value;
};

//Trims, lowercases and validates an email.
export const normalizeEmail = (raw: string): string => {
  const email = raw.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    throw appError(ErrorCode.INVALID_EMAIL, 'That email address does not look right.');
  }
  return email;
};

//Like normalizeEmail, but returns null instead of throwing.
export const tryNormalizeEmail = (raw: string): string | null => {
  try {
    return normalizeEmail(raw);
  } catch {
    return null;
  }
};

//Throws WEAK_PASSWORD unless the password is 8-128 characters and not only spaces.
export const checkPassword = (password: string): void => {
  if (password.length < PASSWORD_MIN) {
    throw appError(
      ErrorCode.WEAK_PASSWORD,
      `Your password needs at least ${PASSWORD_MIN} characters.`,
      { min: PASSWORD_MIN }
    );
  }
  if (password.length > PASSWORD_MAX) {
    throw appError(ErrorCode.WEAK_PASSWORD, 'That password is too long.', { reason: 'TOO_LONG' });
  }
  if (/^\s+$/.test(password)) {
    throw appError(ErrorCode.WEAK_PASSWORD, 'Your password cannot be only spaces.', {
      reason: 'BLANK',
    });
  }
};

//Checks a code is six digits.
export const checkOtpCode = (code: string): string => {
  const trimmed = code.trim();
  if (!/^\d{6}$/.test(trimmed)) {
    throw appError(ErrorCode.OTP_INCORRECT, 'That code is not right.');
  }
  return trimmed;
};

//Checks a device identifier; a missing one is INVALID_DEVICE_ID with reason MISSING.
export const checkDeviceId = (deviceId: string | null | undefined): string => {
  if (!deviceId) {
    throw appError(ErrorCode.INVALID_DEVICE_ID, 'This request is missing its device identifier.', {
      reason: 'MISSING',
    });
  }
  const trimmed = deviceId.trim();
  if (trimmed.length < 8 || trimmed.length > 128 || !/^[\w-]+$/.test(trimmed)) {
    throw appError(ErrorCode.INVALID_DEVICE_ID, 'That device identifier is not valid.');
  }
  return trimmed;
};

//Checks the timezone is valid for Intl.
export const checkTimezone = (timezone: string): string => {
  const trimmed = timezone.trim();
  try {
    new Intl.DateTimeFormat('en', { timeZone: trimmed });
    return trimmed;
  } catch {
    throw appError(ErrorCode.BAD_USER_INPUT, 'That timezone is not recognised.', {
      reason: 'INVALID_TIMEZONE',
    });
  }
};

//Strips control characters and enforces a maximum length.
export const cleanText = (raw: string, maxLength: number, field: Field): string => {
  const text = raw.replace(CONTROL_CHARS, '').trim();
  if (text.length > maxLength) {
    throw appError(ErrorCode.BAD_USER_INPUT, `${fieldName(field)} is too long.`, {
      reason: 'TOO_LONG',
      field,
    });
  }
  return text;
};

//Checks a real calendar day written as YYYY-MM-DD.
export const checkDay = (raw: string): string => {
  const day = String(raw ?? '').trim();
  if (!DAY_PATTERN.test(day) || addDays(day, 0) !== day) {
    throw appError(ErrorCode.BAD_USER_INPUT, 'That date is not valid.', { reason: 'INVALID_DAY' });
  }
  return day;
};

//Today in the user's timezone, or the given day after checking it is a real,
//past-or-present day at most maxBackdateDays ago.
export const resolveDay = (
  raw: string | null | undefined,
  timezone: string,
  maxBackdateDays: number
): string => {
  const today = dayInZone(new Date(), timezone);
  if (!raw?.trim()) return today;

  const day = checkDay(raw);
  if (day > today) {
    throw appError(ErrorCode.BAD_USER_INPUT, 'You cannot log a day that has not happened yet.', {
      reason: 'FUTURE_DAY',
    });
  }
  if (daysBetween(day, today) > maxBackdateDays) {
    throw appError(ErrorCode.BAD_USER_INPUT, `You can only log the last ${maxBackdateDays} days.`, {
      reason: 'DAY_TOO_OLD',
      maxDays: maxBackdateDays,
    });
  }
  return day;
};

//Masks an email for display: jane.doe@gmail.com -> j****e@gmail.com
export const maskEmail = (email: string): string => {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const name = email.slice(0, at);
  const domain = email.slice(at);
  if (name.length <= 2) return `${name[0]}***${domain}`;
  return `${name[0]}${'*'.repeat(Math.min(name.length - 2, 4))}${name.at(-1)}${domain}`;
};

//Checks a clock time written as HH:MM (24-hour).
export const checkClockTime = (value: string): string => {
  const trimmed = String(value).trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(trimmed)) {
    throw appError(ErrorCode.BAD_USER_INPUT, 'That time is not valid.', { reason: 'INVALID_TIME' });
  }
  return trimmed;
};
