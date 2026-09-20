import { Email } from '../../../domain/auth/value-objects/email.vo.js';
import type { UserRepository } from '../../../domain/auth/repositories/user.repository.js';
import type { CodeDelivery } from '../services/code-delivery.service.js';

//START A PASSWORD RESET.
//
//ALWAYS returns true. An endpoint that says "no such account" is a free
//account-enumeration tool, so the answer is identical whether the address is
//malformed, unknown, unverified, or real and sent to.
//
//That includes failures. A cooldown, an hourly cap or a dead mail provider
//must not become a signal either — they are reported to the logger and
//swallowed, and the user sees the same "check your email" screen.

export interface RequestPasswordResetDeps {
  users: UserRepository;
  codes: CodeDelivery;
  onSuppressed?: (context: { reason: string; email?: string }) => void;
}

export const makeRequestPasswordReset =
  (deps: RequestPasswordResetDeps) =>
  async (input: { email: string; ip: string }): Promise<boolean> => {
    //tryCreate rather than create: a different answer for "not a valid email"
    //and "valid but unknown" is still a signal.
    const email = Email.tryCreate(input.email);
    if (!email) {
      deps.onSuppressed?.({ reason: 'malformed address' });
      return true;
    }

    const user = await deps.users.findByEmail(email.value);

    if (!user || !user.emailVerified) {
      deps.onSuppressed?.({ reason: 'unknown or unverified', email: email.masked });
      return true;
    }

    try {
      await deps.codes.deliver({ user, purpose: 'RESET', ip: input.ip });
    } catch (error) {
      deps.onSuppressed?.({
        reason: error instanceof Error ? error.message : 'delivery failed',
        email: email.masked,
      });
    }

    return true;
  };
