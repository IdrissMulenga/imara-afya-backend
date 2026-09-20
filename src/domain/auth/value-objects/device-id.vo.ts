import { DomainError } from '../../shared/errors/domain.error.js';
import { ErrorCode } from '../../shared/errors/error-codes.js';

//THE PHONE'S OWN IDENTIFIER.
//
//NOT a security boundary. The app generates it and the caller sends it, so
//anyone can claim any value — all it decides is whether a one-time code is
//required. The password is still checked every time.
//
//We bound its shape only so it cannot be used to push arbitrary payloads into
//an index.

export class DeviceId {
  private constructor(public readonly value: string) {}

  static create(raw: string): DeviceId {
    const trimmed = raw.trim();

    if (trimmed.length < 8 || trimmed.length > 128 || !/^[\w-]+$/.test(trimmed)) {
      throw new DomainError(ErrorCode.INVALID_DEVICE_ID, 'That device identifier is not valid.');
    }

    return new DeviceId(trimmed);
  }

  equals(other: DeviceId | string | null): boolean {
    if (other === null) return false;
    return this.value === (typeof other === 'string' ? other : other.value);
  }

  toString(): string {
    return this.value;
  }
}
