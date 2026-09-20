import { DomainError } from '../../shared/errors/domain.error.js';
import { ErrorCode } from '../../shared/errors/error-codes.js';

//A SIX-DIGIT ONE-TIME CODE.
//
//Rejecting the shape before touching the database keeps a malformed guess from
//spending one of the five real attempts.

export class OtpCode {
  static readonly LENGTH = 6;

  private constructor(public readonly value: string) {}

  static create(raw: string): OtpCode {
    const trimmed = raw.trim();

    if (!new RegExp(`^\\d{${OtpCode.LENGTH}}$`).test(trimmed)) {
      throw new DomainError(ErrorCode.OTP_INCORRECT, 'That code is not right.');
    }

    return new OtpCode(trimmed);
  }

  //Takes the randomness from outside so the domain stays pure and a test can
  //produce a known code without stubbing globals.
  static fromNumber(value: number): OtpCode {
    return new OtpCode(String(value % 1_000_000).padStart(OtpCode.LENGTH, '0'));
  }

  toString(): string {
    return '[redacted]';
  }
}
