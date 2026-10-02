import { Schema, model, type Document, type Types } from 'mongoose';

//The fitness band paired with an account. One band per account, one account per band.
export interface IBand extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  //Hardware identifier (serial number or MAC address), uppercased.
  bandId: string;
  bandModel: string;
  firmware: string;
  pairedAt: Date;
  //Last successful sync; null until the first one.
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const bandSchema = new Schema<IBand>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    bandId: { type: String, required: true },
    bandModel: { type: String, default: '', maxlength: 80 },
    firmware: { type: String, default: '', maxlength: 40 },
    pairedAt: { type: Date, default: () => new Date() },
    lastSyncedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

bandSchema.index({ user: 1 }, { unique: true });
bandSchema.index({ bandId: 1 }, { unique: true });

export const Band = model<IBand>('Band', bandSchema);
