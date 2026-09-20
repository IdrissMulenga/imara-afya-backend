import { DomainError } from '../../../domain/shared/errors/domain.error.js';
import { ErrorCode } from '../../../domain/shared/errors/error-codes.js';
import type { TrustedDevice } from '../../../domain/auth/entities/trusted-device.entity.js';
import type { TrustedDeviceRepository } from '../../../domain/auth/repositories/trusted-device.repository.js';
import type { DeviceTrustService } from '../services/device-trust.service.js';

export interface DeviceUseCaseDeps {
  devices: TrustedDeviceRepository;
  deviceTrust: DeviceTrustService;
}

export const makeListTrustedDevices =
  (deps: DeviceUseCaseDeps) =>
  (userId: string): Promise<TrustedDevice[]> =>
    deps.deviceTrust.list(userId);

//Revoking does not end that device's current session — it means the next login
//from it needs a code. To kill a session, log out or reset the password.
export const makeRevokeTrustedDevice =
  (deps: DeviceUseCaseDeps) =>
  async (input: { userId: string; deviceRowId: string }): Promise<boolean> => {
    const removed = await deps.devices.revokeById(input.userId, input.deviceRowId);
    if (!removed) {
      throw new DomainError(ErrorCode.DEVICE_NOT_FOUND, 'That device is no longer on the list.');
    }
    return true;
  };
