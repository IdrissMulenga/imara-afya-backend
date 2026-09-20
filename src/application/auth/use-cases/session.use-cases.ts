import { DomainError } from '../../../domain/shared/errors/domain.error.js';
import { ErrorCode } from '../../../domain/shared/errors/error-codes.js';
import type { User } from '../../../domain/auth/entities/user.entity.js';
import type { UserRepository } from '../../../domain/auth/repositories/user.repository.js';
import type { TokenService } from '../ports/token.port.js';
import type { Clock } from '../ports/clock.port.js';
import type { SessionResult } from '../dto/auth.dto.js';
import { loadUser, issueSession } from './shared.js';

//SESSION LIFECYCLE.
//
//Three operations small enough to share a file without any of them hiding.
//Splitting a four-line use case into its own module is indirection without
//clarity.

export interface SessionDeps {
  users: UserRepository;
  tokens: TokenService;
  clock: Clock;
}

//EXTEND THE WINDOW WITHOUT THE PASSWORD.
//
//The original origin is carried forward, so refreshing does not reset the
//renewal clock. That is the entire mechanism: a session can be renewed for as
//long as the cap allows, then the password must be typed again.
export const makeRefreshSession =
  (deps: SessionDeps) =>
  async (input: { userId: string; origin: string }): Promise<SessionResult> => {
    if (deps.tokens.isOriginExpired(input.origin, deps.clock.now())) {
      throw new DomainError(ErrorCode.SESSION_EXPIRED, 'Please sign in again to continue.');
    }

    const user = await loadUser(deps.users, input.userId);
    return issueSession(deps.tokens, user, new Date(input.origin));
  };

//Bumps tokenVersion, which retires every token this account ever issued — not
//just the one presented. Signing out on a lost phone signs out everywhere,
//which is what people expect the button to mean.
export const makeLogout =
  (deps: SessionDeps) =>
  async (userId: string): Promise<boolean> => {
    const user = await loadUser(deps.users, userId);
    user.revokeSessions();
    await deps.users.save(user);
    return true;
  };

export const makeGetMe =
  (deps: SessionDeps) =>
  (userId: string): Promise<User> =>
    loadUser(deps.users, userId);
