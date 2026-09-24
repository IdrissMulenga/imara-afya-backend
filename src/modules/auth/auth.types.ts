import type { IUser } from '../user/user.model.js';

export interface SignUpInput {
  email: string;
  password: string;
  deviceId: string;
  deviceLabel?: string;
  language?: 'en' | 'fr' | 'sw' | 'rn';
}

export interface LoginInput {
  email: string;
  password: string;
  deviceId: string;
  deviceLabel?: string;
}

export interface VerifyOtpInput {
  code: string;
  deviceId?: string;
  deviceLabel?: string;
}

export interface VerifyResetOtpInput {
  email: string;
  code: string;
}

export interface ResetPasswordInput {
  resetToken: string;
  password: string;
  deviceId: string;
  deviceLabel?: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface AuthPayload {
  token: string;
  user: IUser;
}

//Returned by login on an untrusted device: a code was sent, no token yet.
export interface OtpChallenge {
  challenge: true;
  purpose: 'LOGIN';
  expiresAt: Date;
  maskedEmail: string;
}

export type LoginResult = AuthPayload | OtpChallenge;

export const isAuthPayload = (result: LoginResult): result is AuthPayload => 'token' in result;

export interface ResetTicket {
  resetToken: string;
  expiresAt: Date;
}
