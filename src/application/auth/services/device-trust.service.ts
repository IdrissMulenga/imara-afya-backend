import type { TrustedDeviceRepository } from '../../../domain/auth/repositories/trusted-device.repository.js';
import type { Clock } from '../ports/clock.port.js';
import type { AuthPolicy } from '../ports/auth-policy.port.js';

//DECIDING WHETHER A PHONE HAS TO TYPE A CODE.
//
//Four use cases touch device trust and all of them need the same expiry
//arithmetic, so it lives here once rather than in each of them.

export interface DeviceTrustDeps {
  devices: TrustedDeviceRepository;
  clock: Clock;
  policy: AuthPolicy;
}

const DEFAULT_LABEL = 'Unknown device';
const MAX_LABEL_LENGTH = 80;

//Control characters stripped so a label cannot break a log line or a rendered
//list in settings.
const cleanLabel = (raw?: string): string => {
  if (!raw) return DEFAULT_LABEL;
  const text = raw
    .replace(new RegExp('[\\x00-\\x1F\\x7F]', 'g'), '')
    .trim()
    .slice(0, MAX_LABEL_LENGTH);
  return text || DEFAULT_LABEL;
};

export const createDeviceTrustService = (deps: DeviceTrustDeps) => {
  const { devices, clock, policy } = deps;

  const expiryFrom = (now: Date): Date =>
    new Date(now.getTime() + policy.deviceTrustDays * 24 * 60 * 60 * 1000);

  const isTrusted = async (userId: string, deviceId: string): Promise<boolean> => {
    const device = await devices.find(userId, deviceId);
    return device !== null && device.isValid(clock.now());
  };

  const trust = async (params: {
    userId: string;
    deviceId: string;
    label?: string;
  }): Promise<void> => {
    const now = clock.now();
    await devices.trust({
      userId: params.userId,
      deviceId: params.deviceId,
      label: cleanLabel(params.label),
      now,
      expiresAt: expiryFrom(now),
    });
  };

  //Refreshes the window on a login that did not need a code, so a phone in
  //weekly use never lapses.
  const touch = async (userId: string, deviceId: string): Promise<void> => {
    const now = clock.now();
    await devices.touch(userId, deviceId, now, expiryFrom(now));
  };

  const list = (userId: string) => devices.listForUser(userId, policy.maxTrustedDevices);

  //Used by password reset. Someone resetting because they believe the account
  //was taken should not leave the other person's phone trusted.
  const revokeAll = (userId: string) => devices.deleteAllForUser(userId);

  return { isTrusted, trust, touch, list, revokeAll };
};

export type DeviceTrustService = ReturnType<typeof createDeviceTrustService>;
