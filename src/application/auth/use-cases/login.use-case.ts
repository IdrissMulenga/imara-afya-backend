import { Email } from '../../../domain/auth/value-objects/email.vo.js';
import { DeviceId } from '../../../domain/auth/value-objects/device-id.vo.js';
import { DomainError } from '../../../domain/shared/errors/domain.error.js';
import { ErrorCode } from '../../../domain/shared/errors/error-codes.js';
import type { UserRepository } from '../../../domain/auth/repositories/user.repository.js';
import type { Hasher } from '../ports/hasher.port.js';
import type { TokenService } from '../ports/token.port.js';
import type { CodeDelivery } from '../services/code-delivery.service.js';
import type { DeviceTrustService } from '../services/device-trust.service.js';
import type { LoginInput, LoginResult } from '../dto/auth.dto.js';
import { issueSession } from './shared.js';

//SIGN IN.
//
//A trusted device gets a token. Anything else gets a code and no token at all.

export interface LoginDeps {
  users: UserRepository;
  hasher: Hasher;
  tokens: TokenService;
  codes: CodeDelivery;
  deviceTrust: DeviceTrustService;
}

export const makeLogin =
  (deps: LoginDeps) =>
  async (input: LoginInput): Promise<LoginResult> => {
    const email = Email.create(input.email);
    const deviceId = DeviceId.create(input.deviceId);

    const user = await deps.users.findByEmail(email.value);

    //TIMING SAFETY.
    //
    //The comparison runs whether or not a user was found. Returning early on a
    //missing user would make an unknown address answer in a millisecond while
    //a known one takes the ~100ms bcrypt costs, and that gap is a free account
    //enumeration oracle.
    if (!user) {
      await deps.hasher.compareWithDummy(input.password);
      throw new DomainError(
        ErrorCode.INVALID_CREDENTIALS,
        'That email or password is not right.'
      );
    }

    if (!(await deps.hasher.compare(input.password, user.passwordHash))) {
      //One message for both cases, deliberately. "No account with that email"
      //is a free account-enumeration tool.
      throw new DomainError(
        ErrorCode.INVALID_CREDENTIALS,
        'That email or password is not right.'
      );
    }

    if (await deps.deviceTrust.isTrusted(user.id, deviceId.value)) {
      await deps.deviceTrust.touch(user.id, deviceId.value);
      return issueSession(deps.tokens, user);
    }

    //An unverified address cannot receive a login code, because there is no
    //evidence it belongs to this person. They can still sign in from the
    //device they signed up on, and verify from there.
    if (!user.emailVerified) {
      throw new DomainError(
        ErrorCode.EMAIL_NOT_VERIFIED,
        'Please confirm your email address from the device you signed up on first.'
      );
    }

    const expiresAt = await deps.codes.deliver({
      user,
      purpose: 'LOGIN',
      ip: input.ip,
      deviceId: deviceId.value,
    });

    return {
      challenge: true,
      purpose: 'LOGIN',
      expiresAt,
      maskedEmail: Email.create(user.email).masked,
    };
  };
