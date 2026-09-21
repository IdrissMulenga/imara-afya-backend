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
  //WHEN THE ROW IS DELETED — deliberately much later than expiresAt.
  //
  //The hourly resend cap counts rows created in the last hour. While the TTL
  //index sat on expiresAt every row vanished ten minutes after it was written,
  //so the count never had more than ten minutes of history to read and "3 per
  //hour" was really "3 per ten minutes" — about 18 an hour. The row has to
  //outlive the code for the counting to mean anything.
  purgeAt: Date;
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
    purgeAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    consumedAt: { type: Date, default: null },
    ip: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

//The lookup every verification does.
otpSchema.index({ user: 1, purpose: 1, consumedAt: 1 });

//MongoDB deletes the row once purgeAt passes — no cron job, and the collection
//cannot grow forever.
//
//NOT on expiresAt, for the reason spelled out on purgeAt above. Expiry itself
//is enforced in otp.service.ts, which is where it belonged anyway: the TTL
//sweep only runs about once a minute, so a row can always outlive its expiry.
//
//MIGRATION — an existing deployment still carries the old index, and Mongo will
//not replace it on its own. Drop it once, or it keeps deleting rows early and
//this change does nothing:
//    db.otps.dropIndex('expiresAt_1')
otpSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

//Counting resends in the last hour reads this.
otpSchema.index({ user: 1, purpose: 1, createdAt: -1 });

export const Otp = model<IOtp>('Otp', otpSchema);
