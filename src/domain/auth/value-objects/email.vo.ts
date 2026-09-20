import { DomainError } from '../../shared/errors/domain.error.js';
import { ErrorCode } from '../../shared/errors/error-codes.js';

//EMAIL AS A VALUE OBJECT.
//
//A string that has been proven to look like an address and has been
//normalised. Once you hold an Email, no further checking is needed anywhere
//downstream — which is the point: validation happens once, at the boundary,
//and the type carries the proof.
//
//Deliberately permissive. Strict RFC 5322 rejects addresses that work, and the
//only real proof an address exists is that a code sent to it comes back.

const PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_LENGTH = 254;

export class Email {
  private constructor(public readonly value: string) {}

  static create(raw: string): Email {
    const normalised = raw.trim().toLowerCase();

    if (!PATTERN.test(normalised) || normalised.length > MAX_LENGTH) {
      throw new DomainError(ErrorCode.INVALID_EMAIL, 'That email address does not look right.');
    }

    return new Email(normalised);
  }

  //Returns null instead of throwing, for the paths that must not reveal
  //whether an address is valid — password reset answers identically either way.
  static tryCreate(raw: string): Email | null {
    try {
      return Email.create(raw);
    } catch {
      return null;
    }
  }

  //Enough for the user to know which inbox to open, not enough for an attacker
  //to learn an address they did not already have.
  get masked(): string {
    const at = this.value.indexOf('@');
    const name = this.value.slice(0, at);
    const domain = this.value.slice(at);
    if (name.length <= 2) return `${name[0]}***${domain}`;
    const stars = '*'.repeat(Math.min(name.length - 2, 4));
    return `${name[0]}${stars}${name.at(-1)}${domain}`;
  }

  toString(): string {
    return this.value;
  }
}
