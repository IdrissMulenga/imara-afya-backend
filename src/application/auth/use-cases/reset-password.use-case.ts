import { Password } from '../../../domain/auth/value-objects/password.vo.js';
import { DeviceId } from '../../../domain/auth/value-objects/device-id.vo.js';
import { DomainError } from '../../../domain/shared/errors/domain.error.js';
import { ErrorCode } from '../../../domain/shared/errors/error-codes.js';
import type { UserRepository } from '../../../domain/auth/repositories/user.repository.js';
import type { Hasher } from '../ports/hasher.port.js';
import type { TokenService } from '../ports/token.port.js';
import type { AuthPolicy } from '../ports/auth-policy.port.js';
import type { DeviceTrustService } from '../services/device-trust.service.js';
import type { ResetPasswordInput, SessionResult } from '../dto/auth.dto.js';
import { loadUser, issueSession } from './shared.js';

//SET A NEW PASSWORD WITH A RESET TICKET.

export interface ResetPasswordDeps {
  users: UserRepository;
  hasher: Hasher;
  tokens: TokenService;
  deviceTrust: DeviceTrustService;
  policy: AuthPolicy;
}

export const makeResetPassword =
  (deps: ResetPasswordDeps) =>
  async (input: ResetPasswordInput): Promise<SessionResult> => {
    const password = Password.create(input.password);
    const deviceId = DeviceId.create(input.deviceId);

    //Rejects a session token presented here — the ticket carries an explicit
    //purpose claim that this checks.
    const { userId } = deps.tokens.verifyReset(input.resetToken);
    const user = await loadUser(deps.users, userId);

    if (await deps.hasher.compare(password.value, user.passwordHash)) {
      throw new DomainError(
        ErrorCode.PASSWORD_UNCHANGED,
        'That is your current password. Please choose a different one.'
      );
    }

    //changePasswordHash also bumps tokenVersion, which retires every token the
    //account ever issued. The entity owns that pairing so no flow can set a
    //password without revoking.
    user.changePasswordHash(
      await deps.hasher.hash(password.value, deps.policy.passwordHashRounds)
    );
    await deps.users.save(user);

    //Someone resetting because they think the account was taken should not
    //leave the other person's phone trusted. Everything goes, then this
    //device alone is trusted again.
    await deps.deviceTrust.revokeAll(user.id);
    await deps.deviceTrust.trust({
      userId: user.id,
      deviceId: deviceId.value,
      label: input.deviceLabel,
    });

    //Logged straight in. Making someone reset a password and then immediately
    //type it again is friction with no security value.
    return issueSession(deps.tokens, user);
  };
