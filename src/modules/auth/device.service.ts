import type { Types } from 'mongoose';
import { Device } from './device.model.js';
import { env } from '../../config/env.js';
import { appError, ErrorCode } from '../../shared/errors.js';
import { cleanText } from '../../shared/validation.js';
import { daysFromNow } from '../../shared/datetime.js';

//Maximum trusted devices per user.
const MAX_DEVICES = 20;

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

export const isDeviceTrusted = async (
  userId: Types.ObjectId,
  deviceId: string
): Promise<boolean> => {
  const device = await Device.findOne({ user: userId, deviceId }).lean();
  return device !== null && device.expiresAt.getTime() > Date.now();
};

//Trusts a device for DEVICE_TRUST_DAYS (insert or refresh).
export const trustDevice = async (params: {
  userId: Types.ObjectId;
  deviceId: string;
  label?: string;
}): Promise<void> => {
  const label = params.label
    ? cleanText(params.label, 80, 'deviceName') || 'Unknown device'
    : 'Unknown device';

  await Device.updateOne(
    { user: params.userId, deviceId: params.deviceId },
    {
      $set: { lastSeenAt: new Date(), expiresAt: daysFromNow(env.DEVICE_TRUST_DAYS), label },
      $setOnInsert: { user: params.userId, deviceId: params.deviceId },
    },
    { upsert: true }
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

export const listDevices = (userId: Types.ObjectId) =>
  Device.find({ user: userId }).sort({ lastSeenAt: -1 }).limit(MAX_DEVICES).lean();

export const revokeDevice = async (userId: Types.ObjectId, id: string): Promise<void> => {
  if (!/^[0-9a-fA-F]{24}$/.test(id)) {
    throw appError(ErrorCode.DEVICE_NOT_FOUND, 'That device is no longer on the list.');
  }
  const result = await Device.deleteOne({ _id: id, user: userId });
  if (result.deletedCount === 0) {
    throw appError(ErrorCode.DEVICE_NOT_FOUND, 'That device is no longer on the list.');
  }
};

export const revokeAllDevices = async (userId: Types.ObjectId): Promise<void> => {
  await Device.deleteMany({ user: userId });
};
