import { Schema, model, type Document, type Types } from 'mongoose';

export interface IUser extends Document {
  _id: Types.ObjectId;
  email: string;
  passwordHash: string;

  emailVerified: boolean;
  emailVerifiedAt: Date | null;

  //Incremented to invalidate every existing token.
  tokenVersion: number;
  failedPasswordAttempts: number;

  name: string;
  photoUrl: string;
  gender: 'female' | 'male' | 'unspecified';
  birthDate: Date | null;
  heightCm: number | null;
  weightKg: number | null;

  language: 'en' | 'fr' | 'sw' | 'rn';
  units: 'metric' | 'imperial';
  //IANA timezone used for all day calculations.
  timezone: string;
  cycleTrackingEnabled: boolean;

  waterGoalGlasses: number;
  stepGoal: number;
  sleepGoalHours: number;
  //Sleep schedule as HH:MM in the user's timezone; null when not set.
  sleepBedtime: string | null;
  sleepWakeTime: string | null;
  //Schedule for nights ending on Saturday and Sunday; null means the same as weekdays.
  sleepWeekendBedtime: string | null;
  sleepWeekendWakeTime: string | null;

  role: 'user' | 'admin';
  createdAt: Date;
  updatedAt: Date;
}

//HH:MM, 24-hour.
const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },

    emailVerified: { type: Boolean, default: false },
    emailVerifiedAt: { type: Date, default: null },

    tokenVersion: { type: Number, default: 0 },
    failedPasswordAttempts: { type: Number, default: 0 },

    name: { type: String, default: '', trim: true, maxlength: 80 },
    photoUrl: { type: String, default: '' },
    gender: { type: String, enum: ['female', 'male', 'unspecified'], default: 'unspecified' },
    birthDate: { type: Date, default: null },
    heightCm: { type: Number, default: null, min: 50, max: 260 },
    weightKg: { type: Number, default: null, min: 20, max: 400 },

    language: { type: String, enum: ['en', 'fr', 'sw', 'rn'], default: 'en' },
    units: { type: String, enum: ['metric', 'imperial'], default: 'metric' },
    timezone: { type: String, default: 'Africa/Bujumbura' },

    cycleTrackingEnabled: { type: Boolean, default: false },

    waterGoalGlasses: { type: Number, default: 8, min: 1, max: 30 },
    stepGoal: { type: Number, default: 8000, min: 500, max: 100000 },
    sleepGoalHours: { type: Number, default: 8, min: 3, max: 14 },
    sleepBedtime: { type: String, default: null, match: CLOCK_TIME },
    sleepWakeTime: { type: String, default: null, match: CLOCK_TIME },
    sleepWeekendBedtime: { type: String, default: null, match: CLOCK_TIME },
    sleepWeekendWakeTime: { type: String, default: null, match: CLOCK_TIME },

    role: { type: String, enum: ['user', 'admin'], default: 'user' },
  },
  { timestamps: true }
);

export const User = model<IUser>('User', userSchema);
