import { DomainError } from '../../../domain/shared/errors/domain.error.js';
import { ErrorCode } from '../../../domain/shared/errors/error-codes.js';
import type { User } from '../../../domain/auth/entities/user.entity.js';
import type { UserRepository } from '../../../domain/auth/repositories/user.repository.js';
import type { TokenService } from '../ports/token.port.js';
import type { SessionResult } from '../dto/auth.dto.js';

//THE TWO LINES EVERY AUTHENTICATED USE CASE WOULD OTHERWISE REPEAT.
//
//Nine flows load a user by id and throw the same error when it is missing, and
//six mint a session from a user. Copy-pasting either is how two call sites end
//up disagreeing about the message or the code.

export const loadUser = async (users: UserRepository, id: string): Promise<User> => {
  const user = await users.findById(id);
  if (!user) {
    throw new DomainError(ErrorCode.ACCOUNT_NOT_FOUND, 'That account no longer exists.');
  }
  return user;
};

//`origin` defaults to now — a fresh sign-in. Refresh passes the ORIGINAL
//origin forward, which is what stops renewing from resetting the 30-day clock.
export const issueSession = (
  tokens: TokenService,
  user: User,
  origin: Date = new Date()
): SessionResult => ({
  token: tokens.signSession(user.id, user.tokenVersion, origin),
  user,
});
