import { Email } from '../../../domain/auth/value-objects/email.vo.js';
import { DomainError } from '../../../domain/shared/errors/domain.error.js';
import { ErrorCode } from '../../../domain/shared/errors/error-codes.js';
import type { UserRepository } from '../../../domain/auth/repositories/user.repository.js';
import type { TokenService } from '../ports/token.port.js';
import type { Clock } from '../ports/clock.port.js';
import type { AuthPolicy } from '../ports/auth-policy.port.js';
import type { OtpService } from '../services/otp.service.js';
import type { ResetTicketResult } from '../dto/auth.dto.js';

//TRADE A PROVEN CODE FOR A SHORT-LIVED TICKET.
//
//The ticket exists so the code is not carried around and re-sent alongside the
//new password. Prove possession once, then set the password.

export interface VerifyPasswordResetOtpDeps {
  users: UserRepository;
  tokens: TokenService;
  otpService: OtpService;
  clock: Clock;
  policy: AuthPolicy;
}

export const makeVerifyPasswordResetOtp =
  (deps: VerifyPasswordResetOtpDeps) =>
  async (input: { email: string; code: string }): Promise<ResetTicketResult> => {
    const email = Email.create(input.email);
    const user = await deps.users.findByEmail(email.value);

    if (!user) {
      throw new DomainError(
        ErrorCode.OTP_NOT_FOUND,
        'That code is no longer valid. Please ask for a new one.'
      );
    }

    await deps.otpService.verify({ userId: user.id, purpose: 'RESET', code: input.code });

    return {
      resetToken: deps.tokens.signReset(user.id),
      expiresAt: new Date(deps.clock.now().getTime() + deps.policy.resetTokenMinutes * 60_000),
    };
  };
