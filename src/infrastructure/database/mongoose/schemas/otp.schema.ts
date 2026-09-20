import { Schema, model, type Document, type Types } from 'mongoose';

export interface OtpDoc extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  codeHash: string;
  purpose: 'SIGNUP' | 'LOGIN' | 'RESET';
  channel: 'EMAIL' | 'SMS';
  deviceId: string | null;
  expiresAt: Date;
  attempts: number;
  consumedAt: Date | null;
  ip: string;
  createdAt: Date;
}

const otpSchema = new Schema<OtpDoc>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    //The code itself is never stored — only a bcrypt hash of it, for the same
    //reason a password is hashed: a leaked database must not contain live codes.
    codeHash: { type: String, required: true },
    purpose: { type: String, enum: ['SIGNUP', 'LOGIN', 'RESET'], required: true },
    channel: { type: String, enum: ['EMAIL', 'SMS'], default: 'EMAIL' },
    deviceId: { type: String, default: null },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    consumedAt: { type: Date, default: null },
    ip: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

//The lookup every verification performs.
otpSchema.index({ user: 1, purpose: 1, consumedAt: 1 });

//Expired rows clear themselves — no cron job, and the collection cannot grow
//without bound. The TTL monitor runs about once a minute, so expiry is also
//checked in code; this index is housekeeping, not the control.
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

//Counting resends in the last hour reads this.
otpSchema.index({ user: 1, purpose: 1, createdAt: -1 });

export const OtpModel = model<OtpDoc>('Otp', otpSchema);
