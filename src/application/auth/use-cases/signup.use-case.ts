import { Email } from '../../../domain/auth/value-objects/email.vo.js';
import { Password } from '../../../domain/auth/value-objects/password.vo.js';
import { DeviceId } from '../../../domain/auth/value-objects/device-id.vo.js';
import { DomainError } from '../../../domain/shared/errors/domain.error.js';
import { ErrorCode } from '../../../domain/shared/errors/error-codes.js';
import type { UserRepository } from '../../../domain/auth/repositories/user.repository.js';
import type { Hasher } from '../ports/hasher.port.js';
import type { TokenService } from '../ports/token.port.js';
import type { AuthPolicy } from '../ports/auth-policy.port.js';
import type { CodeDelivery } from '../services/code-delivery.service.js';
import type { DeviceTrustService } from '../services/device-trust.service.js';
import type { SignupInput, SessionResult } from '../dto/auth.dto.js';
import { issueSession } from './shared.js';

//CREATE AN ACCOUNT.
//
//Returns a working session immediately; verification happens afterwards from
//inside the app. An unverified user can track their day — someone who cannot
//log a glass of water on day one does not come back on day two — and the one
//thing they cannot do is recover the account, because sending a recovery code
//to an unproven address is how an account gets handed to a typo.

export interface SignupDeps {
  users: UserRepository;
  hasher: Hasher;
  tokens: TokenService;
  codes: CodeDelivery;
  deviceTrust: DeviceTrustService;
  policy: AuthPolicy;
}

export const makeSignup =
  (deps: SignupDeps) =>
  async (input: SignupInput): Promise<SessionResult> => {
    const email = Email.create(input.email);
    const password = Password.create(input.password);
    const deviceId = DeviceId.create(input.deviceId);

    if (await deps.users.existsByEmail(email.value)) {
      throw new DomainError(ErrorCode.EMAIL_TAKEN, 'That email address is already registered.');
    }

    const user = await deps.users.create({
      email: email.value,
      passwordHash: await deps.hasher.hash(password.value, deps.policy.passwordHashRounds),
    });

    //The signing device is trusted from the start. Asking for a code on the
    //phone that just created the account proves nothing.
    await deps.deviceTrust.trust({
      userId: user.id,
      deviceId: deviceId.value,
      label: input.deviceLabel,
    });

    await deps.codes.deliverBestEffort({
      user,
      purpose: 'SIGNUP',
      ip: input.ip,
      skipResendGuard: true,
    });

    return issueSession(deps.tokens, user);
  };
