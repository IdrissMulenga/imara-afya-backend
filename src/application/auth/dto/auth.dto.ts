import type { User } from '../../../domain/auth/entities/user.entity.js';

//WHAT CROSSES THE APPLICATION BOUNDARY.
//
//Plain shapes, no classes and no transport vocabulary. A GraphQL resolver, a
//REST controller and a test all hand a use case the same object.

export interface SignupInput {
  email: string;
  password: string;
  deviceId: string;
  deviceLabel?: string;
  ip: string;
}

export interface LoginInput {
  email: string;
  password: string;
  deviceId: string;
  deviceLabel?: string;
  ip: string;
}

export interface VerifyLoginOtpInput {
  email: string;
  code: string;
  deviceId: string;
  deviceLabel?: string;
}

export interface ResetPasswordInput {
  resetToken: string;
  password: string;
  deviceId: string;
  deviceLabel?: string;
}

export interface ChangePasswordInput {
  userId: string;
  currentPassword: string;
  newPassword: string;
}

export interface ProfilePatch {
  name?: string;
  photoUrl?: string;
  gender?: 'female' | 'male' | 'unspecified';
  birthDate?: string;
  heightCm?: number;
  weightKg?: number;
}

export interface PreferencesPatch {
  language?: 'en' | 'fr' | 'sw' | 'rn';
  units?: 'metric' | 'imperial';
  timezone?: string;
  cycleTrackingEnabled?: boolean;
  waterGoalGlasses?: number;
  stepGoal?: number;
  sleepGoalHours?: number;
}

//--- results ---

export interface SessionResult {
  token: string;
  user: User;
}

//Returned by login when the device is not trusted. Deliberately carries NO
//token: the caller has proved a password but not possession of the inbox.
export interface OtpChallengeResult {
  challenge: true;
  purpose: 'LOGIN';
  expiresAt: Date;
  maskedEmail: string;
}

export type LoginResult = SessionResult | OtpChallengeResult;

export const isSessionResult = (result: LoginResult): result is SessionResult =>
  'token' in result;

export interface ResetTicketResult {
  resetToken: string;
  expiresAt: Date;
}
