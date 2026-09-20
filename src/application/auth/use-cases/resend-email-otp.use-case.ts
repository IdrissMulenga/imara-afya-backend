import type { UserRepository } from '../../../domain/auth/repositories/user.repository.js';
import type { CodeDelivery } from '../services/code-delivery.service.js';
import { loadUser } from './shared.js';

export interface ResendEmailOtpDeps {
  users: UserRepository;
  codes: CodeDelivery;
}

export const makeResendEmailOtp =
  (deps: ResendEmailOtpDeps) =>
  async (input: { userId: string; ip: string }): Promise<boolean> => {
    const user = await loadUser(deps.users, input.userId);
    if (user.emailVerified) return true;

    await deps.codes.deliver({ user, purpose: 'SIGNUP', ip: input.ip });
    return true;
  };
