import { Schema, model, type Document, type Types } from 'mongoose';

export type OtpPurpose = 'SIGNUP' | 'LOGIN' | 'RESET';

export interface IOtp extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  //bcrypt hash of the code.
  codeHash: string;
  purpose: OtpPurpose;
  //Delivery channel. Only EMAIL is implemented.
  channel: 'EMAIL' | 'SMS';
  //LOGIN codes only: the device this code will trust.
  deviceId: string | null;
  expiresAt: Date;
  //When the row is deleted; later than expiresAt so the hourly resend count sees it.
  purgeAt: Date;
  attempts: number;
  consumedAt: Date | null;
  ip: string;
  createdAt: Date;
}

const otpSchema = new Schema<IOtp>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    codeHash: { type: String, required: true },
    purpose: { type: String, enum: ['SIGNUP', 'LOGIN', 'RESET'], required: true },
    channel: { type: String, enum: ['EMAIL', 'SMS'], default: 'EMAIL' },
    deviceId: { type: String, default: null },
    expiresAt: { type: Date, required: true },
    purgeAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    consumedAt: { type: Date, default: null },
    ip: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

otpSchema.index({ user: 1, purpose: 1, consumedAt: 1 });

//Deletes rows once purgeAt passes.
otpSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

otpSchema.index({ user: 1, purpose: 1, createdAt: -1 });

export const Otp = model<IOtp>('Otp', otpSchema);
