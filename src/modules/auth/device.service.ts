import type { Types } from 'mongoose';
import { Device } from './device.model.js';
import { env } from '../../config/env.js';
import { appError, ErrorCode } from '../../shared/errors.js';
import { cleanText } from '../../shared/validation.js';
import { daysFromNow } from '../../shared/datetime.js';

//DEVICE TRUST.
//
//Decides whether a phone has to type a code. See device.model.ts for why this
//is NOT a security factor.

//ENFORCED in trustDevice below, not just applied as a `.limit()` on the list.
//It used to be the limit alone, which meant rows grew without bound and the
//user could not revoke a phone the list was quietly hiding from them.
const MAX_DEVICES = 20;

//Keeps the most recently seen MAX_DEVICES rows and drops the rest.
//
//Nothing is lost by evicting: a dropped phone simply types a code the next time
//it signs in, which is the ordinary path for a device we do not recognise.
const evictBeyondCap = async (userId: Types.ObjectId): Promise<void> => {
  const surplus = await Device.find({ user: userId })
    .sort({ lastSeenAt: -1 })
    .skip(MAX_DEVICES)
    .select({ _id: 1 })
    .lean();

  if (surplus.length === 0) return;

  await Device.deleteMany({ _id: { $in: surplus.map((device) => device._id) } });
};

export const isDeviceTrusted = async (userId: Types.ObjectId, deviceId: string): Promise<boolean> => {
  const device = await Device.findOne({ user: userId, deviceId }).lean();
  //Checked here as well as by the TTL index, for the same reason as the codes:
  //the index sweeps on its own schedule.
  return device !== null && device.expiresAt.getTime() > Date.now();
};

//Update-or-insert, so logging in twice from the same phone refreshes the
//window instead of creating a second row.
export const trustDevice = async (params: { userId: Types.ObjectId; deviceId: string; label?: string }): Promise<void> => {
  const label = params.label ? cleanText(params.label, 80, 'Device name') || 'Unknown device' : 'Unknown device';

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

//Called on a login that did not need a code, so a phone in weekly use never
//lapses.
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
  //Filtered by user AND id. Without the user filter any signed-in caller could
  //revoke anyone's device by guessing an id.
  const result = await Device.deleteOne({ _id: id, user: userId });
  if (result.deletedCount === 0) {
    throw appError(ErrorCode.DEVICE_NOT_FOUND, 'That device is no longer on the list.');
  }
};

export const revokeAllDevices = async (userId: Types.ObjectId): Promise<void> => {
  await Device.deleteMany({ user: userId });
};
