import type { Request } from 'express';
import { DomainError } from '../../domain/shared/errors/domain.error.js';
import { ErrorCode } from '../../domain/shared/errors/error-codes.js';
import type { UserRepository } from '../../domain/auth/repositories/user.repository.js';
import type { TokenService } from '../../application/auth/ports/token.port.js';
import type { AuthenticatedCaller } from './context.js';

//WHO IS CALLING.
//
//Runs on every request carrying a bearer token. A request without one is not
//an error — plenty of fields are public — it simply produces no caller, and
//the resolver guards refuse anything that needs one.
//
//An INVALID token is different from an absent one and does throw, because
//silently treating a revoked token as "not signed in" would show the user a
//login screen with no explanation of why they were signed out.

export interface AuthenticateDeps {
  users: UserRepository;
  tokens: TokenService;
}

export const makeAuthenticate =
  (deps: AuthenticateDeps) =>
  async (request: Request): Promise<{ caller?: AuthenticatedCaller; token?: string }> => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return {};

    const token = header.slice(7).trim();
    if (!token) return {};

    const claims = deps.tokens.verifySession(token);
    const user = await deps.users.findById(claims.userId);

    if (!user) {
      throw new DomainError(ErrorCode.UNAUTHENTICATED, 'That account no longer exists.');
    }

    //THE REVOCATION CHECK.
    //
    //A token minted before the last logout, password change or reset carries
    //an older tokenVersion. One comparison retires all of them at once, with
    //no denylist to store and no cache to invalidate.
    if (claims.tokenVersion !== user.tokenVersion) {
      throw new DomainError(
        ErrorCode.TOKEN_REVOKED,
        'You have been signed out. Please sign in again.'
      );
    }

    return {
      token,
      caller: {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        timezone: user.timezone,
        role: user.role,
      },
    };
  };
