import { Schema, model, type Document, type Types } from 'mongoose';

//One mood-and-energy check-in. A user can log several a day.
export interface ICheckIn extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  //YYYY-MM-DD in the user's timezone.
  day: string;
  //When it was logged. Older check-ins may lack it; createdAt stands in.
  at: Date;
  //1 (very low) to 5 (very good).
  mood: number;
  //1 (exhausted) to 5 (full of energy).
  energy: number;
  note: string;
  createdAt: Date;
  updatedAt: Date;
}

const checkInSchema = new Schema<ICheckIn>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    day: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    at: { type: Date, default: () => new Date() },
    mood: { type: Number, required: true, min: 1, max: 5 },
    energy: { type: Number, required: true, min: 1, max: 5 },
    note: { type: String, default: '', maxlength: 500 },
  },
  { timestamps: true }
);

checkInSchema.index({ user: 1, day: -1, at: -1 });

export const CheckIn = model<ICheckIn>('CheckIn', checkInSchema);
