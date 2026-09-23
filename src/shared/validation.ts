import { appError, ErrorCode } from './errors.js';
import { fieldName, type Field } from './messages.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CONTROL_CHARS = new RegExp('[\\x00-\\x1F\\x7F]', 'g');

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

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

export const checkDeviceId = (deviceId: string): string => {
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

//Masks an email for display: jane.doe@gmail.com -> j****e@gmail.com
export const maskEmail = (email: string): string => {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const name = email.slice(0, at);
  const domain = email.slice(at);
  if (name.length <= 2) return `${name[0]}***${domain}`;
  return `${name[0]}${'*'.repeat(Math.min(name.length - 2, 4))}${name.at(-1)}${domain}`;
};
