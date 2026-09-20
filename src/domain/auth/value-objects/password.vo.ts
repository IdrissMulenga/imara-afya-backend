import { DomainError } from '../../shared/errors/domain.error.js';
import { ErrorCode } from '../../shared/errors/error-codes.js';

//A PLAINTEXT PASSWORD THAT HAS PASSED THE RULES.
//
//Never persisted and never logged — it exists only long enough to be handed to
//a hasher. Holding the rules here rather than in a validator function means a
//use case cannot accidentally hash something unchecked.

export class Password {
  static readonly MIN_LENGTH = 8;
  //bcrypt silently truncates past 72 bytes, and a very long password is a cheap
  //way to make the server burn CPU hashing it.
  static readonly MAX_LENGTH = 128;

  private constructor(public readonly value: string) {}

  static create(raw: string): Password {
    if (raw.length < Password.MIN_LENGTH) {
      throw new DomainError(
        ErrorCode.WEAK_PASSWORD,
        `Your password needs at least ${Password.MIN_LENGTH} characters.`
      );
    }

    if (raw.length > Password.MAX_LENGTH) {
      throw new DomainError(ErrorCode.WEAK_PASSWORD, 'That password is too long.');
    }

    //No composition rules beyond length. Requiring a symbol and a digit pushes
    //people towards "Password1!" and towards writing it down; length is what
    //actually costs an attacker anything.
    if (/^\s+$/.test(raw)) {
      throw new DomainError(ErrorCode.WEAK_PASSWORD, 'Your password cannot be only spaces.');
    }

    return new Password(raw);
  }

  //Stops a password reaching a log line through string interpolation.
  toString(): string {
    return '[redacted]';
  }
}
