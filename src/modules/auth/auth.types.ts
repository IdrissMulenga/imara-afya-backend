import type { IUser } from '../user/user.model.js';

//WHAT THE APP SENDS, AND WHAT THE AUTH SERVICES RETURN.

export interface SignUpInput {
  email: string;
  password: string;
  deviceId: string;
  deviceLabel?: string;
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

//--- results ---

export interface AuthPayload {
  token: string;
  user: IUser;
}

//Returned by login when the phone is not trusted. Note: NO token — the
//password was proved, possession of the inbox was not.
export interface OtpChallenge {
  challenge: true;
  purpose: 'LOGIN';
  expiresAt: Date;
  maskedEmail: string;
}

export type LoginResult = AuthPayload | OtpChallenge;

//Lets the resolver tell GraphQL which of the two it got back.
export const isAuthPayload = (result: LoginResult): result is AuthPayload => 'token' in result;

export interface ResetTicket {
  resetToken: string;
  expiresAt: Date;
}
