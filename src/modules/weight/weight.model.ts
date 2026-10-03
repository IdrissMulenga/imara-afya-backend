import { Schema, model, type Document, type Types } from 'mongoose';

//One weight per user per day; the newest day is the profile's weightKg.
export interface IWeightLog extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  //YYYY-MM-DD in the user's timezone.
  day: string;
  kg: number;
  createdAt: Date;
  updatedAt: Date;
}

const weightLogSchema = new Schema<IWeightLog>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    day: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    kg: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

weightLogSchema.index({ user: 1, day: -1 }, { unique: true });

export const WeightLog = model<IWeightLog>('WeightLog', weightLogSchema);
