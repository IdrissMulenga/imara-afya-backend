import { Schema, model, type Document, type Types } from 'mongoose';

//Where a day's steps or sleep came from: the paired band, a phone's sensors or health data, the
//user by hand, or (sleep only) an estimate from the sleep schedule.
export const DATA_SOURCES = ['BAND', 'PHONE', 'MANUAL', 'ESTIMATE'] as const;
export type DataSource = (typeof DATA_SOURCES)[number];

//One row per user per day, holding that day's water, steps and sleep.
export interface IHabitLog extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  //YYYY-MM-DD in the user's timezone.
  day: string;
  waterGlasses: number;
  steps: number | null;
  //Sleep that ended on this day (last night's sleep is logged on the morning's day).
  sleepHours: number | null;
  //Where steps and sleepHours came from; null for values saved before sources were recorded.
  stepsSource: DataSource | null;
  sleepSource: DataSource | null;
  createdAt: Date;
  updatedAt: Date;
}

const habitLogSchema = new Schema<IHabitLog>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    day: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    waterGlasses: { type: Number, default: 0, min: 0 },
    steps: { type: Number, default: null, min: 0 },
    sleepHours: { type: Number, default: null, min: 0 },
    stepsSource: { type: String, enum: [...DATA_SOURCES, null], default: null },
    sleepSource: { type: String, enum: [...DATA_SOURCES, null], default: null },
  },
  { timestamps: true }
);

habitLogSchema.index({ user: 1, day: -1 }, { unique: true });

export const HabitLog = model<IHabitLog>('HabitLog', habitLogSchema);
