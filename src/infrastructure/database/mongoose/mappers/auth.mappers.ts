import { User } from '../../../../domain/auth/entities/user.entity.js';
import { Otp } from '../../../../domain/auth/entities/otp.entity.js';
import { TrustedDevice } from '../../../../domain/auth/entities/trusted-device.entity.js';
import type { UserDoc } from '../schemas/user.schema.js';
import type { OtpDoc } from '../schemas/otp.schema.js';
import type { TrustedDeviceDoc } from '../schemas/trusted-device.schema.js';

//THE TRANSLATION BETWEEN STORAGE AND DOMAIN.
//
//Every ObjectId becomes a string here and nowhere else. That one rule is what
//keeps `Types.ObjectId` out of the inner layers entirely — a use case that
//never sees one cannot accidentally depend on MongoDB.

export const toUser = (doc: UserDoc): User =>
  new User({
    id: String(doc._id),
    email: doc.email,
    passwordHash: doc.passwordHash,
    emailVerified: doc.emailVerified,
    emailVerifiedAt: doc.emailVerifiedAt,
    tokenVersion: doc.tokenVersion,
    failedPasswordAttempts: doc.failedPasswordAttempts,
    name: doc.name,
    photoUrl: doc.photoUrl,
    gender: doc.gender,
    birthDate: doc.birthDate,
    heightCm: doc.heightCm,
    weightKg: doc.weightKg,
    language: doc.language,
    units: doc.units,
    timezone: doc.timezone,
    cycleTrackingEnabled: doc.cycleTrackingEnabled,
    waterGoalGlasses: doc.waterGoalGlasses,
    stepGoal: doc.stepGoal,
    sleepGoalHours: doc.sleepGoalHours,
    role: doc.role,
    createdAt: doc.createdAt,
  });

export const toOtp = (doc: OtpDoc): Otp =>
  new Otp({
    id: String(doc._id),
    userId: String(doc.user),
    codeHash: doc.codeHash,
    purpose: doc.purpose,
    channel: doc.channel,
    deviceId: doc.deviceId,
    expiresAt: doc.expiresAt,
    attempts: doc.attempts,
    consumedAt: doc.consumedAt,
    ip: doc.ip,
    createdAt: doc.createdAt,
  });

export const toTrustedDevice = (doc: TrustedDeviceDoc): TrustedDevice =>
  new TrustedDevice({
    id: String(doc._id),
    userId: String(doc.user),
    deviceId: doc.deviceId,
    label: doc.label,
    lastSeenAt: doc.lastSeenAt,
    expiresAt: doc.expiresAt,
  });
