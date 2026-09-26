import { Schema, model, type Document, type Types } from 'mongoose';
import {
  DISCHARGES,
  FLOWS,
  SYMPTOMS,
  type Discharge,
  type Flow,
  type Symptom,
} from './cycle.types.js';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

//One period: the day it started and, once over, the day it ended.
export interface ICyclePeriod extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  //YYYY-MM-DD in the user's timezone.
  start: string;
  //YYYY-MM-DD, or null while the period is open.
  end: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const cyclePeriodSchema = new Schema<ICyclePeriod>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    start: { type: String, required: true, match: DAY },
    end: { type: String, default: null, match: DAY },
  },
  { timestamps: true }
);

cyclePeriodSchema.index({ user: 1, start: -1 }, { unique: true });

export const CyclePeriod = model<ICyclePeriod>('CyclePeriod', cyclePeriodSchema);

//What was noted on one day: flow, symptoms, discharge and a note.
export interface ICycleDay extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  //YYYY-MM-DD in the user's timezone.
  day: string;
  flow: Flow;
  symptoms: Symptom[];
  discharge: Discharge | null;
  note: string;
  createdAt: Date;
  updatedAt: Date;
}

const cycleDaySchema = new Schema<ICycleDay>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    day: { type: String, required: true, match: DAY },
    flow: { type: String, enum: FLOWS, default: 'NONE' },
    symptoms: { type: [{ type: String, enum: SYMPTOMS }], default: [] },
    discharge: { type: String, enum: DISCHARGES, default: null },
    note: { type: String, default: '', maxlength: 300 },
  },
  { timestamps: true }
);

cycleDaySchema.index({ user: 1, day: -1 }, { unique: true });

export const CycleDay = model<ICycleDay>('CycleDay', cycleDaySchema);
