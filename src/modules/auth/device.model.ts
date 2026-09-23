import { Schema, model, type Document, type Types } from 'mongoose';

//A device that can sign in without a one-time code.

export interface IDevice extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  deviceId: string;
  label: string;
  lastSeenAt: Date;
  expiresAt: Date;
}

const deviceSchema = new Schema<IDevice>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    deviceId: { type: String, required: true },
    label: { type: String, default: 'Unknown device', maxlength: 80 },
    lastSeenAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

deviceSchema.index({ user: 1, deviceId: 1 }, { unique: true });

deviceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Device = model<IDevice>('Device', deviceSchema);
