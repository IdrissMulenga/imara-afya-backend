import type { Otp, OtpProps, OtpPurpose } from '../entities/otp.entity.js';

export type NewOtp = Omit<OtpProps, 'id' | 'createdAt' | 'attempts' | 'consumedAt'>;

export interface OtpRepository {
  create(data: NewOtp): Promise<Otp>;

  //The newest live code for this user and purpose. There is only ever one —
  //issuing a new code consumes the previous one — but "newest" is stated
  //explicitly so the contract does not depend on that invariant holding.
  findLatestLive(userId: string, purpose: OtpPurpose): Promise<Otp | null>;

  //The most recent code of any state, used to measure the resend cooldown.
  findLatest(userId: string, purpose: OtpPurpose): Promise<Otp | null>;

  countSince(userId: string, purpose: OtpPurpose, since: Date): Promise<number>;

  save(otp: Otp): Promise<void>;

  //Called when a new code is issued: everything still live for that purpose is
  //marked spent, so a user reading the newest email is never fighting a stale
  //code and the guessing surface stays at one code.
  consumeAllLive(userId: string, purpose: OtpPurpose, now: Date): Promise<void>;

  deleteAllForUser(userId: string): Promise<void>;
}
