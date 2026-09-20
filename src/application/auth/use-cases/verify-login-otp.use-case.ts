import { Email } from '../../../domain/auth/value-objects/email.vo.js';
import { DeviceId } from '../../../domain/auth/value-objects/device-id.vo.js';
import { DomainError } from '../../../domain/shared/errors/domain.error.js';
import { ErrorCode } from '../../../domain/shared/errors/error-codes.js';
import type { UserRepository } from '../../../domain/auth/repositories/user.repository.js';
import type { TokenService } from '../ports/token.port.js';
import type { OtpService } from '../services/otp.service.js';
import type { DeviceTrustService } from '../services/device-trust.service.js';
import type { VerifyLoginOtpInput, SessionResult } from '../dto/auth.dto.js';
import { issueSession } from './shared.js';

//FINISH SIGNING IN FROM A NEW DEVICE.
//
//Unauthenticated: the caller has no token yet, which is the whole reason they
//are here. The email plus a live code for it is what identifies them.

export interface VerifyLoginOtpDeps {
  users: UserRepository;
  tokens: TokenService;
  otpService: OtpService;
  deviceTrust: DeviceTrustService;
}

export const makeVerifyLoginOtp =
  (deps: VerifyLoginOtpDeps) =>
  async (input: VerifyLoginOtpInput): Promise<SessionResult> => {
    const email = Email.create(input.email);
    const deviceId = DeviceId.create(input.deviceId);

    const user = await deps.users.findByEmail(email.value);

    //Same shape as a wrong code. An unknown address must not be
    //distinguishable from a known one with a bad code.
    if (!user) {
      throw new DomainError(
        ErrorCode.OTP_NOT_FOUND,
        'That code is no longer valid. Please ask for a new one.'
      );
    }

    const { deviceId: issuedFor } = await deps.otpService.verify({
      userId: user.id,
      purpose: 'LOGIN',
      code: input.code,
    });

    //A code issued for one phone must not trust a different one.
    if (issuedFor && !deviceId.equals(issuedFor)) {
      throw new DomainError(
        ErrorCode.OTP_NOT_FOUND,
        'That code was for a different device. Please sign in again.'
      );
    }

    await deps.deviceTrust.trust({
      userId: user.id,
      deviceId: deviceId.value,
      label: input.deviceLabel,
    });

    return issueSession(deps.tokens, user);
  };
