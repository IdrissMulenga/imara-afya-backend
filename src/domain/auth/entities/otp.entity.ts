import { DomainError } from '../../shared/errors/domain.error.js';
import { ErrorCode } from '../../shared/errors/error-codes.js';

//A ONE-TIME CODE, AND THE RULES THAT GOVERN IT.
//
//The code itself is never held here — only its hash. Comparing is delegated to
//a hasher port, because how a hash is computed is an infrastructure detail
//while WHEN a code is dead is a business rule, and those belong apart.
//
//Every expiry and attempt rule lives in this file. One place to audit, one
//place to change.

export type OtpPurpose = 'SIGNUP' | 'LOGIN' | 'RESET';
export type OtpChannel = 'EMAIL' | 'SMS';

export interface OtpProps {
  id: string;
  userId: string;
  codeHash: string;
  purpose: OtpPurpose;
  //Only EMAIL is implemented. The field exists from day one because email is
  //not the primary channel in Burundi; adding SMS should be a provider swap,
  //not a migration on a collection with live rows in it.
  channel: OtpChannel;
  //Set on LOGIN codes: the device this code will trust once it verifies.
  deviceId: string | null;
  expiresAt: Date;
  attempts: number;
  consumedAt: Date | null;
  ip: string;
  createdAt: Date;
}

export class Otp {
  constructor(private readonly props: OtpProps) {}

  get id(): string {
    return this.props.id;
  }
  get userId(): string {
    return this.props.userId;
  }
  get codeHash(): string {
    return this.props.codeHash;
  }
  get deviceId(): string | null {
    return this.props.deviceId;
  }
  get attempts(): number {
    return this.props.attempts;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get snapshot(): Readonly<OtpProps> {
    return { ...this.props };
  }

  get isConsumed(): boolean {
    return this.props.consumedAt !== null;
  }

  isExpired(now: Date): boolean {
    return this.props.expiresAt.getTime() <= now.getTime();
  }

  consume(now: Date): void {
    this.props.consumedAt = now;
  }

  recordFailedAttempt(): void {
    this.props.attempts += 1;
  }

  attemptsExhausted(max: number): boolean {
    return this.props.attempts >= max;
  }

  //THE GATE BEFORE A HASH IS EVEN COMPARED.
  //
  //The TTL index in the database sweeps on its own schedule — roughly once a
  //minute — so a row can outlive its own expiry. Expiry is enforced here; the
  //index is housekeeping, not the control.
  assertUsable(now: Date, maxAttempts: number): void {
    if (this.isConsumed) {
      throw new DomainError(
        ErrorCode.OTP_NOT_FOUND,
        'That code is no longer valid. Please ask for a new one.'
      );
    }

    if (this.isExpired(now)) {
      throw new DomainError(
        ErrorCode.OTP_EXPIRED,
        'That code has expired. Please ask for a new one.'
      );
    }

    if (this.attemptsExhausted(maxAttempts)) {
      throw new DomainError(
        ErrorCode.OTP_ATTEMPTS_EXCEEDED,
        'Too many incorrect attempts. Please ask for a new code.'
      );
    }
  }

  //A code issued for one phone must not trust a different one. Without this,
  //a code read off someone's screen could be replayed from another device to
  //make the attacker's phone permanently trusted.
  assertIssuedForDevice(deviceId: string): void {
    if (this.props.deviceId && this.props.deviceId !== deviceId) {
      throw new DomainError(
        ErrorCode.OTP_NOT_FOUND,
        'That code was for a different device. Please sign in again.'
      );
    }
  }
}
