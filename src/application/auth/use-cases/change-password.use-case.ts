import { Password } from '../../../domain/auth/value-objects/password.vo.js';
import { DomainError } from '../../../domain/shared/errors/domain.error.js';
import { ErrorCode } from '../../../domain/shared/errors/error-codes.js';
import type { UserRepository } from '../../../domain/auth/repositories/user.repository.js';
import type { Hasher } from '../ports/hasher.port.js';
import type { TokenService } from '../ports/token.port.js';
import type { AuthPolicy } from '../ports/auth-policy.port.js';
import type { ChangePasswordInput, SessionResult } from '../dto/auth.dto.js';
import { loadUser, issueSession } from './shared.js';

//ROTATE A PASSWORD YOU KNOW.
//
//Authenticated, current password required, no code — the session is already
//proof of possession.
//
//Trusted devices SURVIVE this. Choosing to rotate a password you know is a
//different signal from resetting one you lost.

export interface ChangePasswordDeps {
  users: UserRepository;
  hasher: Hasher;
  tokens: TokenService;
  policy: AuthPolicy;
}

export const makeChangePassword =
  (deps: ChangePasswordDeps) =>
  async (input: ChangePasswordInput): Promise<SessionResult> => {
    const next = Password.create(input.newPassword);
    const user = await loadUser(deps.users, input.userId);

    user.assertPasswordAttemptsRemain(deps.policy.maxPasswordAttempts);

    if (!(await deps.hasher.compare(input.currentPassword, user.passwordHash))) {
      user.recordFailedPasswordAttempt();
      await deps.users.save(user);

      throw new DomainError(ErrorCode.WRONG_PASSWORD, 'That is not your current password.', {
        meta: {
          attemptsLeft: Math.max(
            0,
            deps.policy.maxPasswordAttempts - user.failedPasswordAttempts
          ),
        },
      });
    }

    if (input.currentPassword === input.newPassword) {
      throw new DomainError(
        ErrorCode.PASSWORD_UNCHANGED,
        'Your new password is the same as the old one.'
      );
    }

    user.changePasswordHash(
      await deps.hasher.hash(next.value, deps.policy.passwordHashRounds)
    );
    await deps.users.save(user);

    return issueSession(deps.tokens, user);
  };
