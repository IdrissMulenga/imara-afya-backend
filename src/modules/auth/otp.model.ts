import { Schema, model, type Document, type Types } from 'mongoose';

//ONE-TIME CODES.
//
//The code is NEVER stored — only a bcrypt hash of it, the same reason
//passwords are hashed: a database that leaks must not contain live codes.

export type OtpPurpose = 'SIGNUP' | 'LOGIN' | 'RESET';

export interface IOtp extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  codeHash: string;
  purpose: OtpPurpose;
  //Only EMAIL is implemented. The field exists now because email is not the
  //main channel in Burundi — adding SMS later should be a provider swap, not a
  //migration on a collection with live rows.
  channel: 'EMAIL' | 'SMS';
  //Set on LOGIN codes: which phone this code will trust when it verifies.
  deviceId: string | null;
  expiresAt: Date;
  attempts: number;
  //Non-null means used up. Never reusable.
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
    attempts: { type: Number, default: 0 },
    consumedAt: { type: Date, default: null },
    ip: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

//The lookup every verification does.
otpSchema.index({ user: 1, purpose: 1, consumedAt: 1 });

//MongoDB deletes the row once expiresAt passes — no cron job, and the
//collection cannot grow forever. But the sweep runs about once a minute, so a
//row can outlive its expiry; the service checks expiry in code as well.
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

//Counting resends in the last hour reads this.
otpSchema.index({ user: 1, purpose: 1, createdAt: -1 });

export const Otp = model<IOtp>('Otp', otpSchema);
