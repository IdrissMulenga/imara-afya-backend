import { Email } from '../../../domain/auth/value-objects/email.vo.js';
import { DeviceId } from '../../../domain/auth/value-objects/device-id.vo.js';
import type { UserRepository } from '../../../domain/auth/repositories/user.repository.js';
import type { CodeDelivery } from '../services/code-delivery.service.js';

export interface ResendLoginOtpDeps {
  users: UserRepository;
  codes: CodeDelivery;
}

export const makeResendLoginOtp =
  (deps: ResendLoginOtpDeps) =>
  async (input: { email: string; deviceId: string; ip: string }): Promise<boolean> => {
    const email = Email.create(input.email);
    const deviceId = DeviceId.create(input.deviceId);

    const user = await deps.users.findByEmail(email.value);

    //Silent success for an unknown or unverified address, for the same
    //enumeration reason as everywhere else. Nothing is sent.
    if (!user || !user.emailVerified) return true;

    await deps.codes.deliver({
      user,
      purpose: 'LOGIN',
      ip: input.ip,
      deviceId: deviceId.value,
    });

    return true;
  };
