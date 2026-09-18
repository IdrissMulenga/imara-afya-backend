import { Schema, model, type Document, type Types } from 'mongoose';

//THE USER DOCUMENT.
//
//Everything that identifies an account and controls access to it. Profile
//detail that is not load-bearing for auth (photo, height, goals) hangs off the
//same document for now, because one read serves the whole dashboard and a
//separate profile collection would mean a join on every request.

export interface UserDocument extends Document {
  _id: Types.ObjectId;
  //Mongoose's virtual. Declared so callers can use it without a cast.
  id: string;
  email: string;
  passwordHash: string;

  //--- verification ---
  emailVerified: boolean;
  emailVerifiedAt: Date | null;

  //--- session control ---
  //Bumped on logout, password change and password reset. Every issued token
  //carries the value it was minted under; a token whose value is behind this
  //one is dead. That is the whole revocation mechanism.
  tokenVersion: number;

  //Feeds the five-attempt lockout on changePassword. Cleared by a correct one.
  failedPasswordAttempts: number;

  //--- profile ---
  name: string;
  photoUrl: string;
  gender: 'female' | 'male' | 'unspecified';
  birthDate: Date | null;
  heightCm: number | null;
  weightKg: number | null;

  //--- preferences ---
  language: 'en' | 'fr' | 'sw' | 'rn';
  units: 'metric' | 'imperial';
  //Pushed from the phone on launch. Every day-grouping decision reads this,
  //never the server clock.
  timezone: string;
  cycleTrackingEnabled: boolean;

  //--- daily goals ---
  waterGoalGlasses: number;
  stepGoal: number;
  sleepGoalHours: number;

  role: 'user' | 'admin';
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDocument>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, required: true },

    emailVerified: { type: Boolean, default: false },
    emailVerifiedAt: { type: Date, default: null },

    tokenVersion: { type: Number, default: 0 },
    failedPasswordAttempts: { type: Number, default: 0 },

    name: { type: String, default: '', trim: true, maxlength: 80 },
    photoUrl: { type: String, default: '' },
    gender: {
      type: String,
      enum: ['female', 'male', 'unspecified'],
      default: 'unspecified',
    },
    birthDate: { type: Date, default: null },
    heightCm: { type: Number, default: null, min: 50, max: 260 },
    weightKg: { type: Number, default: null, min: 20, max: 400 },

    language: { type: String, enum: ['en', 'fr', 'sw', 'rn'], default: 'en' },
    units: { type: String, enum: ['metric', 'imperial'], default: 'metric' },
    timezone: { type: String, default: 'Africa/Bujumbura' },

    //Gated by a preference, not by gender. A toggle is a choice the user makes;
    //inferring it from the gender field makes an assumption on their behalf and
    //leaves anyone who did not state a gender with no way to turn it on.
    cycleTrackingEnabled: { type: Boolean, default: false },

    waterGoalGlasses: { type: Number, default: 8, min: 1, max: 30 },
    stepGoal: { type: Number, default: 8000, min: 500, max: 100000 },
    sleepGoalHours: { type: Number, default: 8, min: 3, max: 14 },

    role: { type: String, enum: ['user', 'admin'], default: 'user' },
  },
  {
    timestamps: true,
    //The hash must never reach a response, and the surest way to guarantee
    //that is for it not to be in the object the resolver returns.
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.passwordHash;
        return ret;
      },
    },
  }
);

export const User = model<UserDocument>('User', userSchema);
