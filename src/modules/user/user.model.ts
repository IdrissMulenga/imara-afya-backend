import { Schema, model, type Document, type Types } from 'mongoose';

//THE USER.
//
//This interface describes one document. Services import `User` below and use
//it directly — User.findOne(), user.save(). No wrapper, no repository.

export interface IUser extends Document {
  _id: Types.ObjectId;
  email: string;
  passwordHash: string;

  emailVerified: boolean;
  emailVerifiedAt: Date | null;

  //Every token carries the tokenVersion it was signed with. Bumping this
  //number makes every older token fail — that is the whole logout mechanism.
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
  //Pushed from the phone. Every "which day is it" decision reads this, never
  //the server clock — the server is UTC and the user is not.
  timezone: string;
  cycleTrackingEnabled: boolean;

  waterGoalGlasses: number;
  stepGoal: number;
  sleepGoalHours: number;

  role: 'user' | 'admin';
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
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

    //A toggle the user sets, not something inferred from gender — that would
    //make the assumption for them and leave anyone who stated no gender
    //without a way to turn it on.
    cycleTrackingEnabled: { type: Boolean, default: false },

    waterGoalGlasses: { type: Number, default: 8, min: 1, max: 30 },
    stepGoal: { type: Number, default: 8000, min: 500, max: 100000 },
    sleepGoalHours: { type: Number, default: 8, min: 3, max: 14 },

    role: { type: String, enum: ['user', 'admin'], default: 'user' },
  },
  { timestamps: true }
);

export const User = model<IUser>('User', userSchema);
