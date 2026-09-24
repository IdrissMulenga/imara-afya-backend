import { Schema, model, type Document, type Types } from 'mongoose';

//One row per user per day, holding that day's water, steps and sleep.
export interface IHabitLog extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  //YYYY-MM-DD in the user's timezone.
  day: string;
  waterGlasses: number;
  steps: number;
  //Sleep that ended on this day (last night's sleep is logged on the morning's day).
  sleepHours: number;
  createdAt: Date;
  updatedAt: Date;
}

const habitLogSchema = new Schema<IHabitLog>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    day: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    waterGlasses: { type: Number, default: 0, min: 0 },
    steps: { type: Number, default: 0, min: 0 },
    sleepHours: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

habitLogSchema.index({ user: 1, day: -1 }, { unique: true });

export const HabitLog = model<IHabitLog>('HabitLog', habitLogSchema);
