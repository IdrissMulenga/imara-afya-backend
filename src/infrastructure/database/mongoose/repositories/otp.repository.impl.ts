import { OtpModel } from '../schemas/otp.schema.js';
import { toOtp } from '../mappers/auth.mappers.js';
import type { Otp } from '../../../../domain/auth/entities/otp.entity.js';
import type { NewOtp, OtpRepository } from '../../../../domain/auth/repositories/otp.repository.js';

export const mongoOtpRepository: OtpRepository = {
  create: async (data: NewOtp) => {
    const doc = await OtpModel.create({
      user: data.userId,
      codeHash: data.codeHash,
      purpose: data.purpose,
      channel: data.channel,
      deviceId: data.deviceId,
      expiresAt: data.expiresAt,
      ip: data.ip,
    });
    return toOtp(doc);
  },

  findLatestLive: async (userId, purpose) => {
    const doc = await OtpModel.findOne({ user: userId, purpose, consumedAt: null }).sort({
      createdAt: -1,
    });
    return doc ? toOtp(doc) : null;
  },

  findLatest: async (userId, purpose) => {
    const doc = await OtpModel.findOne({ user: userId, purpose }).sort({ createdAt: -1 });
    return doc ? toOtp(doc) : null;
  },

  countSince: (userId, purpose, since) =>
    OtpModel.countDocuments({ user: userId, purpose, createdAt: { $gte: since } }),

  save: async (otp: Otp) => {
    const { id, attempts, consumedAt } = otp.snapshot;
    await OtpModel.updateOne({ _id: id }, { $set: { attempts, consumedAt } });
  },

  consumeAllLive: async (userId, purpose, now) => {
    await OtpModel.updateMany(
      { user: userId, purpose, consumedAt: null },
      { $set: { consumedAt: now } }
    );
  },

  deleteAllForUser: async (userId) => {
    await OtpModel.deleteMany({ user: userId });
  },
};
