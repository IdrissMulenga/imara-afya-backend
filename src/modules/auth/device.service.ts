import crypto from 'node:crypto';
import { isValidObjectId, type Types } from 'mongoose';
import { Device } from './device.model.js';
import { env } from '../../config/env.js';
import { appError, ErrorCode } from '../../shared/errors.js';
import { checkDeviceSecret, cleanText } from '../../shared/validation.js';
import { daysFromNow } from '../../shared/datetime.js';
import { upsertWithRetry } from '../../shared/upsert.js';

//Maximum trusted devices per user.
const MAX_DEVICES = 20;
//How often a device in use has its last-seen time and trust window extended.
const TOUCH_EVERY_MS = 24 * 60 * 60 * 1000;

//Deletes the least recently seen devices beyond MAX_DEVICES.
const evictBeyondCap = async (userId: Types.ObjectId): Promise<void> => {
  const surplus = await Device.find({ user: userId })
    .sort({ lastSeenAt: -1 })
    .skip(MAX_DEVICES)
    .select({ _id: 1 })
    .lean();

  if (surplus.length === 0) return;

  await Device.deleteMany({ _id: { $in: surplus.map((device) => device._id) } });
};

export const createDeviceSecret = (): string => crypto.randomBytes(32).toString('hex');

//SHA-256 of a device secret, as hex. The secret is random, so a slow hash adds nothing.
export const hashDeviceSecret = (secret: string): string =>
  crypto.createHash('sha256').update(secret).digest('hex');

//True when the secret matches the stored hash; compared in constant time.
export const verifyDeviceSecret = (
  secret: string | undefined,
  hash: string | undefined
): boolean => {
  if (!secret || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = Buffer.from(hashDeviceSecret(secret), 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
};

//True when the device proves possession of its secret and its trust has not expired.
//A device trusted before secrets existed has none, so it gets a code once and is re-trusted.
export const isDeviceTrusted = async (
  userId: Types.ObjectId,
  deviceId: string,
  deviceSecret?: string
): Promise<boolean> => {
  const device = await Device.findOne({ user: userId, deviceId })
    .select({ expiresAt: 1, secretHash: 1 })
    .lean();

  if (!device || !device.secretHash || !deviceSecret) return false;
  if (device.expiresAt.getTime() <= Date.now()) return false;

  return verifyDeviceSecret(deviceSecret, device.secretHash);
};

//Trusts a device for DEVICE_TRUST_DAYS (insert or refresh) and stores a secret hash.
export const trustDevice = async (params: {
  userId: Types.ObjectId;
  deviceId: string;
  deviceSecret: string;
  label?: string;
}): Promise<void> => {
  const deviceSecret = checkDeviceSecret(params.deviceSecret);
  const label = params.label
    ? cleanText(params.label, 80, 'deviceName') || 'Unknown device'
    : 'Unknown device';

  const secretHash = hashDeviceSecret(deviceSecret);

  await upsertWithRetry(() =>
    Device.updateOne(
      { user: params.userId, deviceId: params.deviceId },
      {
        $set: {
          lastSeenAt: new Date(),
          expiresAt: daysFromNow(env.DEVICE_TRUST_DAYS),
          label,
          secretHash,
        },
        $setOnInsert: {
          user: params.userId,
          deviceId: params.deviceId,
        },
      },
      { upsert: true }
    )
  );

  await evictBeyondCap(params.userId);
};

//Extends trust for a device that just signed in.
export const touchDevice = async (userId: Types.ObjectId, deviceId: string): Promise<void> => {
  await Device.updateOne(
    { user: userId, deviceId },
    { $set: { lastSeenAt: new Date(), expiresAt: daysFromNow(env.DEVICE_TRUST_DAYS) } }
  );
};

//True when the device a session was signed in on is still trusted; false once it was removed.
//While it is in use, its last-seen time and trust window are extended at most once a day.
export const sessionDeviceActive = async (
  userId: Types.ObjectId,
  deviceId: string
): Promise<boolean> => {
  const device = await Device.findOne({ user: userId, deviceId }).select({ lastSeenAt: 1 }).lean();
  if (!device) return false;
  if (Date.now() - device.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    void touchDevice(userId, deviceId).catch((error) =>
      console.error('[device] could not extend trust:', error)
    );
  }
  return true;
};

//The trusted devices, most recently seen first; current marks the one making the request.
export const listDevices = async (userId: Types.ObjectId, currentDeviceId?: string) => {
  const devices = await Device.find({ user: userId })
    .sort({ lastSeenAt: -1 })
    .limit(MAX_DEVICES)
    .lean();
  return devices.map((device) => ({
    id: String(device._id),
    label: device.label,
    lastSeenAt: device.lastSeenAt.toISOString(),
    expiresAt: device.expiresAt.toISOString(),
    current: Boolean(currentDeviceId) && device.deviceId === currentDeviceId,
  }));
};

//Removes one trusted device; DEVICE_NOT_FOUND if it is not this user's.
export const revokeDevice = async (userId: Types.ObjectId, id: string): Promise<boolean> => {
  const removed =
    isValidObjectId(id) && (await Device.deleteOne({ _id: id, user: userId })).deletedCount > 0;
  if (!removed) throw appError(ErrorCode.DEVICE_NOT_FOUND, 'That device is no longer on the list.');
  return true;
};

//Forgets every trusted device of the user.
export const revokeAllDevices = async (userId: Types.ObjectId): Promise<void> => {
  await Device.deleteMany({ user: userId });
};
