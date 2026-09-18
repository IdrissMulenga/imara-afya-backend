import type { Types } from 'mongoose';
import { TrustedDevice } from '../models/trustedDevice.model.js';
import { env } from '../../../config/env.js';
import { LIMITS } from '../../../config/constants.js';
import { daysFromNow } from '../../../shared/utils/datetime.js';
import { cleanText } from '../../../shared/utils/validation.js';
import { AppError } from '../../../core/errors/AppError.js';
import { ErrorCode } from '../../../core/errors/codes.js';

//DEVICE TRUST.
//
//Whether this phone has to type a code. Not an authentication factor — see the
//note on the model — so nothing here grants access on its own.

export const isTrusted = async (
  user: Types.ObjectId,
  deviceId: string
): Promise<boolean> => {
  const device = await TrustedDevice.findOne({ user, deviceId }).lean();
  if (!device) return false;
  //Checked in code as well as by the TTL index, for the same reason as the
  //codes: the index sweeps on its own schedule, roughly once a minute.
  return device.expiresAt.getTime() > Date.now();
};

//Grant or extend trust. An upsert, so logging in from the same phone twice
//refreshes the window instead of creating a second row.
export const trustDevice = async (params: {
  user: Types.ObjectId;
  deviceId: string;
  label?: string;
}): Promise<void> => {
  const now = new Date();
  const label = params.label
    ? cleanText(params.label, 80, 'Device name') || 'Unknown device'
    : 'Unknown device';

  await TrustedDevice.updateOne(
    { user: params.user, deviceId: params.deviceId },
    {
      $set: {
        lastSeenAt: now,
        expiresAt: daysFromNow(env.DEVICE_TRUST_DAYS, now),
        label,
      },
      $setOnInsert: { user: params.user, deviceId: params.deviceId },
    },
    { upsert: true }
  );
};

//Refresh the window on a login that did not need a code, so a phone in weekly
//use never lapses.
export const touchDevice = async (user: Types.ObjectId, deviceId: string): Promise<void> => {
  const now = new Date();
  await TrustedDevice.updateOne(
    { user, deviceId },
    { $set: { lastSeenAt: now, expiresAt: daysFromNow(env.DEVICE_TRUST_DAYS, now) } }
  );
};

export const listDevices = async (user: Types.ObjectId) =>
  TrustedDevice.find({ user }).sort({ lastSeenAt: -1 }).limit(LIMITS.trustedDevices).lean();

export const revokeDevice = async (user: Types.ObjectId, id: string): Promise<void> => {
  const result = await TrustedDevice.deleteOne({ _id: id, user });
  //Scoped by user as well as id. Without the user filter, any authenticated
  //caller could revoke any row by guessing an id.
  if (result.deletedCount === 0) {
    throw new AppError(ErrorCode.DEVICE_NOT_FOUND, 'That device is no longer on the list.');
  }
};

//Called on password reset. Someone resetting because they believe the account
//was taken should not leave the other person's phone trusted.
export const revokeAllDevices = async (user: Types.ObjectId): Promise<void> => {
  await TrustedDevice.deleteMany({ user });
};
