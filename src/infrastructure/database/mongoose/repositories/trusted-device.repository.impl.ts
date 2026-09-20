import { TrustedDeviceModel } from '../schemas/trusted-device.schema.js';
import { toTrustedDevice } from '../mappers/auth.mappers.js';
import type { TrustedDeviceRepository } from '../../../../domain/auth/repositories/trusted-device.repository.js';

export const mongoTrustedDeviceRepository: TrustedDeviceRepository = {
  find: async (userId, deviceId) => {
    const doc = await TrustedDeviceModel.findOne({ user: userId, deviceId });
    return doc ? toTrustedDevice(doc) : null;
  },

  listForUser: async (userId, limit) => {
    const docs = await TrustedDeviceModel.find({ user: userId })
      .sort({ lastSeenAt: -1 })
      .limit(limit);
    return docs.map(toTrustedDevice);
  },

  trust: async ({ userId, deviceId, label, now, expiresAt }) => {
    await TrustedDeviceModel.updateOne(
      { user: userId, deviceId },
      {
        $set: { lastSeenAt: now, expiresAt, label },
        $setOnInsert: { user: userId, deviceId },
      },
      { upsert: true }
    );
  },

  touch: async (userId, deviceId, now, expiresAt) => {
    await TrustedDeviceModel.updateOne(
      { user: userId, deviceId },
      { $set: { lastSeenAt: now, expiresAt } }
    );
  },

  //Scoped by user as well as id. Without the user filter any authenticated
  //caller could revoke any row by guessing an id.
  revokeById: async (userId, id) => {
    if (!/^[0-9a-fA-F]{24}$/.test(id)) return false;
    const result = await TrustedDeviceModel.deleteOne({ _id: id, user: userId });
    return result.deletedCount > 0;
  },

  deleteAllForUser: async (userId) => {
    await TrustedDeviceModel.deleteMany({ user: userId });
  },
};
