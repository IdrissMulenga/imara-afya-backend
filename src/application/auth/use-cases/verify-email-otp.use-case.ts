import type { User } from '../../../domain/auth/entities/user.entity.js';
import type { UserRepository } from '../../../domain/auth/repositories/user.repository.js';
import type { Clock } from '../ports/clock.port.js';
import type { OtpService } from '../services/otp.service.js';
import { loadUser } from './shared.js';

//CONFIRM THE ADDRESS GIVEN AT SIGNUP.
//
//Authenticated — the user is already inside the app when they do this.

export interface VerifyEmailOtpDeps {
  users: UserRepository;
  otpService: OtpService;
  clock: Clock;
}

export const makeVerifyEmailOtp =
  (deps: VerifyEmailOtpDeps) =>
  async (input: { userId: string; code: string }): Promise<User> => {
    const user = await loadUser(deps.users, input.userId);

    //Idempotent. Tapping verify twice, or verifying on two devices, should not
    //fail with a confusing error.
    if (user.emailVerified) return user;

    await deps.otpService.verify({
      userId: user.id,
      purpose: 'SIGNUP',
      code: input.code,
    });

    user.markEmailVerified(deps.clock.now());
    await deps.users.save(user);

    return user;
  };
