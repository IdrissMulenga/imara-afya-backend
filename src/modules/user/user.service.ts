import bcrypt from 'bcryptjs';
import type { Model } from 'mongoose';
import { User, type IUser } from './user.model.js';
import { Otp, Device } from '../auth/index.js';
import { clearAvatar } from '../upload/avatar.service.js';
import { appError, ErrorCode } from '../../shared/errors.js';
import { cleanText, checkTimezone } from '../../shared/validation.js';
import { fieldName, type Field } from '../../shared/messages.js';
import type { UpdateProfileInput, PreferencesInput } from './user.types.js';

//Loads a user or throws ACCOUNT_NOT_FOUND.
export const getUser = async (id: string): Promise<IUser> => {
  const user = await User.findById(id);
  if (!user) throw appError(ErrorCode.ACCOUNT_NOT_FOUND, 'That account no longer exists.');
  return user;
};

const inRange = (value: number, min: number, max: number, field: Field): number => {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw appError(ErrorCode.BAD_USER_INPUT, `${fieldName(field)} is out of range.`, {
      reason: 'OUT_OF_RANGE',
      field,
    });
  }
  return value;
};

export const updateProfile = async (userId: string, input: UpdateProfileInput): Promise<IUser> => {
  const user = await getUser(userId);

  if (input.name !== undefined) user.name = cleanText(input.name, 80, 'name');
  if (input.gender !== undefined) user.gender = input.gender;
  if (input.heightCm !== undefined) {
    user.heightCm = input.heightCm === null ? null : inRange(input.heightCm, 50, 260, 'height');
  }
  if (input.weightKg !== undefined) {
    user.weightKg = input.weightKg === null ? null : inRange(input.weightKg, 20, 400, 'weight');
  }

  if (input.birthDate === null) {
    user.birthDate = null;
  } else if (input.birthDate !== undefined) {
    const parsed = new Date(input.birthDate);
    if (Number.isNaN(parsed.getTime()) || parsed > new Date()) {
      throw appError(ErrorCode.BAD_USER_INPUT, 'That date of birth is not valid.', {
        reason: 'INVALID_BIRTH_DATE',
      });
    }
    user.birthDate = parsed;
  }

  await user.save();
  return user;
};

export const setPreferences = async (userId: string, input: PreferencesInput): Promise<IUser> => {
  const user = await getUser(userId);

  if (input.language !== undefined) user.language = input.language;
  if (input.units !== undefined) user.units = input.units;
  if (input.timezone !== undefined) user.timezone = checkTimezone(input.timezone);
  if (input.cycleTrackingEnabled !== undefined)
    user.cycleTrackingEnabled = input.cycleTrackingEnabled;
  if (input.waterGoalGlasses !== undefined) {
    user.waterGoalGlasses = inRange(input.waterGoalGlasses, 1, 30, 'waterGoal');
  }
  if (input.stepGoal !== undefined)
    user.stepGoal = inRange(input.stepGoal, 500, 100_000, 'stepGoal');
  if (input.sleepGoalHours !== undefined) {
    user.sleepGoalHours = inRange(input.sleepGoalHours, 3, 14, 'sleepGoal');
  }

  await user.save();
  return user;
};

//Collections deleted along with the account.
const USER_OWNED: Model<{ user: unknown }>[] = [Otp, Device] as unknown as Model<{
  user: unknown;
}>[];

export const deleteAccount = async (userId: string, password: string): Promise<boolean> => {
  const user = await getUser(userId);

  if (!(await bcrypt.compare(password, user.passwordHash))) {
    throw appError(ErrorCode.WRONG_PASSWORD, 'That password is not right.');
  }

  //Deletes the avatar file from disk.
  await clearAvatar(user).catch((error) => {
    console.warn('[user] could not remove avatar on delete:', error);
  });

  for (const Model of USER_OWNED) {
    await Model.deleteMany({ user: user._id });
  }

  await User.deleteOne({ _id: user._id });
  return true;
};

//BMI from height and weight, or null if either is missing.
export const calculateBMI = (heightCm: number | null, weightKg: number | null): number | null => {
  if (!heightCm || !weightKg) return null;
  const metres = heightCm / 100;
  return Math.round((weightKg / (metres * metres)) * 10) / 10;
};
