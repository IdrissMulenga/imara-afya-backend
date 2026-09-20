import { Schema, model, type Document, type Types } from 'mongoose';

//THE PERSISTENCE SHAPE OF A USER.
//
//A mongoose document, not the domain entity. The two are related by a mapper
//and nothing else — which is what lets the entity carry business rules and
//this file carry indexes, defaults and column types without either growing the
//other's concerns.

export interface UserDoc extends Document {
  _id: Types.ObjectId;
  email: string;
  passwordHash: string;
  emailVerified: boolean;
  emailVerifiedAt: Date | null;
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
  timezone: string;
  cycleTrackingEnabled: boolean;
  waterGoalGlasses: number;
  stepGoal: number;
  sleepGoalHours: number;
  role: 'user' | 'admin';
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDoc>(
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

    //Gated by a preference, not by gender. A toggle is a choice the user makes;
    //inferring it from a gender field makes the assumption for them and leaves
    //anyone who stated no gender with no way to turn it on.
    cycleTrackingEnabled: { type: Boolean, default: false },

    waterGoalGlasses: { type: Number, default: 8, min: 1, max: 30 },
    stepGoal: { type: Number, default: 8000, min: 500, max: 100000 },
    sleepGoalHours: { type: Number, default: 8, min: 3, max: 14 },

    role: { type: String, enum: ['user', 'admin'], default: 'user' },
  },
  {
    timestamps: true,
    //The hash must never reach a response, and the surest guarantee is for it
    //not to be in the object that leaves this layer.
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.passwordHash;
        return ret;
      },
    },
  }
);

export const UserModel = model<UserDoc>('User', userSchema);
