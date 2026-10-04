import { Schema, model, type Document, type Types } from 'mongoose';

export const VITAL_KINDS = ['BLOOD_PRESSURE', 'GLUCOSE', 'PULSE'] as const;
export const GLUCOSE_CONTEXTS = ['FASTING', 'AFTER_MEAL', 'RANDOM'] as const;
export type VitalKind = (typeof VITAL_KINDS)[number];
export type GlucoseContext = (typeof GLUCOSE_CONTEXTS)[number];

//One reading: blood pressure (with the pulse the machine shows, if given), blood glucose, or a
//resting pulse. A user can log several a day.
export interface IVitalReading extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  kind: VitalKind;
  //When it was measured.
  at: Date;
  //YYYY-MM-DD of `at` in the user's timezone.
  day: string;
  systolic: number | null;
  diastolic: number | null;
  //Beats per minute.
  pulse: number | null;
  glucoseMmol: number | null;
  glucoseContext: GlucoseContext | null;
  note: string;
  //The app's id for this reading, so a resent one is not saved twice.
  clientId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const vitalReadingSchema = new Schema<IVitalReading>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: VITAL_KINDS, required: true },
    at: { type: Date, required: true },
    day: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    systolic: { type: Number, default: null },
    diastolic: { type: Number, default: null },
    pulse: { type: Number, default: null },
    glucoseMmol: { type: Number, default: null },
    glucoseContext: { type: String, enum: [...GLUCOSE_CONTEXTS, null], default: null },
    note: { type: String, default: '', maxlength: 200 },
    clientId: { type: String },
  },
  { timestamps: true }
);

vitalReadingSchema.index({ user: 1, kind: 1, at: -1 });
vitalReadingSchema.index({ user: 1, at: -1 });
vitalReadingSchema.index(
  { user: 1, clientId: 1 },
  { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } }
);

export const VitalReading = model<IVitalReading>('VitalReading', vitalReadingSchema);
