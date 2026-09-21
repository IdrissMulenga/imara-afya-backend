import { Schema, model, type Document, type Types } from 'mongoose';

//A PHONE THAT SKIPS THE CODE.
//
//NOT a security factor. The app generates deviceId and the caller sends it, so
//anyone could claim any value — all it decides is whether a code is required.
//The password is still checked every single time.
//
//What it buys is friction: a phone used weekly never sees a code, so the code
//still means something when it does appear.

export interface IDevice extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  deviceId: string;
  //"Android 14 · Tecno" — shown in settings so the user recognises which phone
  //a row is before revoking it.
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

//One row per device per user. This is what makes "trust this device" an
//update-or-insert instead of a duplicate row on every login.
deviceSchema.index({ user: 1, deviceId: 1 }, { unique: true });

//Trust lapses on its own after the window.
deviceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Device = model<IDevice>('Device', deviceSchema);
