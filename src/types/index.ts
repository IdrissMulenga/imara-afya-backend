import type { Request } from 'express';
import type { IUser } from '../models/index.js';

//SHARED TYPES.
//
//Anything used by more than one file lives here, so there is one definition
//rather than three that drift apart.

//What every resolver receives as its third argument.
export interface Context {
  //Set when the request carried a valid token. Undefined for public fields.
  user?: IUser;
  //Resolved by express through `trust proxy`. The rate limiters key on it.
  ip: string;
  req: Request;
}

//--- inputs the app sends ---

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

export interface UpdateProfileInput {
  name?: string;
  photoUrl?: string;
  gender?: 'female' | 'male' | 'unspecified';
  birthDate?: string;
  heightCm?: number;
  weightKg?: number;
}

export interface PreferencesInput {
  language?: 'en' | 'fr' | 'sw' | 'rn';
  units?: 'metric' | 'imperial';
  timezone?: string;
  cycleTrackingEnabled?: boolean;
  waterGoalGlasses?: number;
  stepGoal?: number;
  sleepGoalHours?: number;
}

//--- what services return ---

export interface AuthPayload {
  token: string;
  user: IUser;
}

//Login returns this instead when the device is new. Note: no token.
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
