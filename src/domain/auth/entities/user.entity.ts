import { DomainError } from '../../shared/errors/domain.error.js';
import { ErrorCode } from '../../shared/errors/error-codes.js';

//THE USER, AS THE BUSINESS UNDERSTANDS IT.
//
//No mongoose, no decorators, no persistence concerns. A repository loads one
//of these out of whatever store exists; swapping MongoDB for Postgres changes
//the mapper, not this file.
//
//The rules that are always true about a user live here as methods, so a use
//case cannot forget one. `revokeSessions()` is the clearest example: three
//different flows need it and none of them should be reaching in to increment
//a counter by hand.

export type Gender = 'female' | 'male' | 'unspecified';
export type Language = 'en' | 'fr' | 'sw' | 'rn';
export type Units = 'metric' | 'imperial';
export type Role = 'user' | 'admin';

export interface UserProps {
  id: string;
  email: string;
  passwordHash: string;

  emailVerified: boolean;
  emailVerifiedAt: Date | null;

  tokenVersion: number;
  failedPasswordAttempts: number;

  name: string;
  photoUrl: string;
  gender: Gender;
  birthDate: Date | null;
  heightCm: number | null;
  weightKg: number | null;

  language: Language;
  units: Units;
  timezone: string;
  cycleTrackingEnabled: boolean;

  waterGoalGlasses: number;
  stepGoal: number;
  sleepGoalHours: number;

  role: Role;
  createdAt: Date;
}

export class User {
  constructor(private readonly props: UserProps) {}

  get id(): string {
    return this.props.id;
  }
  get email(): string {
    return this.props.email;
  }
  get passwordHash(): string {
    return this.props.passwordHash;
  }
  get emailVerified(): boolean {
    return this.props.emailVerified;
  }
  get tokenVersion(): number {
    return this.props.tokenVersion;
  }
  get failedPasswordAttempts(): number {
    return this.props.failedPasswordAttempts;
  }
  get language(): Language {
    return this.props.language;
  }
  get timezone(): string {
    return this.props.timezone;
  }
  get role(): Role {
    return this.props.role;
  }

  //A plain snapshot for mappers and for the presentation layer. Returning a
  //copy keeps callers from mutating state behind the entity's back.
  get snapshot(): Readonly<UserProps> {
    return { ...this.props };
  }

  //--- rules ---

  markEmailVerified(now: Date): void {
    if (this.props.emailVerified) return;
    this.props.emailVerified = true;
    this.props.emailVerifiedAt = now;
  }

  //RETIRES EVERY TOKEN THIS ACCOUNT EVER ISSUED.
  //
  //Each token carries the tokenVersion it was minted under; one increment
  //makes all older ones fail their check. Logout, password change and password
  //reset all mean "nothing issued before now is still valid", so all three
  //call this rather than reimplementing it.
  revokeSessions(): void {
    this.props.tokenVersion += 1;
  }

  changePasswordHash(hash: string): void {
    this.props.passwordHash = hash;
    this.props.failedPasswordAttempts = 0;
    this.revokeSessions();
  }

  recordFailedPasswordAttempt(): void {
    this.props.failedPasswordAttempts += 1;
  }

  clearFailedPasswordAttempts(): void {
    this.props.failedPasswordAttempts = 0;
  }

  //The lockout is per account, not per IP. Someone who cannot remember the
  //password will not remember it on the sixth try, and the email reset path is
  //always visible so nobody has to fail five times to find it.
  assertPasswordAttemptsRemain(max: number): void {
    if (this.props.failedPasswordAttempts >= max) {
      throw new DomainError(
        ErrorCode.PASSWORD_ATTEMPTS_EXCEEDED,
        'Too many incorrect attempts. Please reset your password by email instead.'
      );
    }
  }

  assertEmailVerified(): void {
    if (!this.props.emailVerified) {
      throw new DomainError(
        ErrorCode.EMAIL_NOT_VERIFIED,
        'Please confirm your email address first.'
      );
    }
  }

  //Derived, never stored. A stored BMI goes stale the moment a weight is
  //logged, and then two numbers in the app disagree.
  get bmi(): number | null {
    const { heightCm, weightKg } = this.props;
    if (!heightCm || !weightKg) return null;
    const metres = heightCm / 100;
    return Math.round((weightKg / (metres * metres)) * 10) / 10;
  }

  //Applied by the profile and preferences use cases. Takes an already-validated
  //partial so the entity never has to know how a transport shaped its input.
  applyPatch(patch: Partial<UserProps>): void {
    Object.assign(this.props, patch);
  }
}
