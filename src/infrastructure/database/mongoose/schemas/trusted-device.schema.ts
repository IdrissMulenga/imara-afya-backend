import { Schema, model, type Document, type Types } from 'mongoose';

export interface TrustedDeviceDoc extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  deviceId: string;
  label: string;
  lastSeenAt: Date;
  expiresAt: Date;
}

const trustedDeviceSchema = new Schema<TrustedDeviceDoc>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    deviceId: { type: String, required: true },
    label: { type: String, default: 'Unknown device', maxlength: 80 },
    lastSeenAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

//One row per device per user. This unique index is what makes "trust this
//device" an upsert rather than a duplicate on every login.
trustedDeviceSchema.index({ user: 1, deviceId: 1 }, { unique: true });

//Trust lapses on its own. A phone untouched for the whole window asks for a
//code once, then is trusted again.
trustedDeviceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const TrustedDeviceModel = model<TrustedDeviceDoc>('TrustedDevice', trustedDeviceSchema);
