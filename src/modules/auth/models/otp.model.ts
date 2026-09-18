import { Schema, model, type Document, type Types } from 'mongoose';

//ONE-TIME CODES.
//
//The code itself is never stored — only a bcrypt hash of it, for the same
//reason passwords are hashed: a leaked database must not contain live codes.
//
//`channel` exists from day one even though only EMAIL is implemented. Email is
//not the primary channel in Burundi; when SMS is added it becomes a provider
//integration rather than a migration on a collection with live rows in it.

export type OtpPurpose = 'SIGNUP' | 'LOGIN' | 'RESET';
export type OtpChannel = 'EMAIL' | 'SMS';

export interface OtpDocument extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  codeHash: string;
  purpose: OtpPurpose;
  channel: OtpChannel;
  //Set on LOGIN codes: the device this code will trust once it verifies. A
  //code issued for one phone must not trust a different one.
  deviceId: string | null;
  expiresAt: Date;
  attempts: number;
  //Non-null means spent. Never reusable, whatever else is true of it.
  consumedAt: Date | null;
  ip: string;
  createdAt: Date;
}

const otpSchema = new Schema<OtpDocument>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
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

//The lookup every verify performs: this user, this purpose, not yet spent.
otpSchema.index({ user: 1, purpose: 1, consumedAt: 1 });

//Expired rows clear themselves. No cron job, no cleanup script, and the
//collection cannot grow without bound.
//
//The TTL monitor runs about once a minute, so a row can outlive its
//expiresAt by up to that long. Expiry is therefore checked in code as well —
//the index is housekeeping, not the control.
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

//Counting resends in the last hour reads this.
otpSchema.index({ user: 1, purpose: 1, createdAt: -1 });

export const Otp = model<OtpDocument>('Otp', otpSchema);
