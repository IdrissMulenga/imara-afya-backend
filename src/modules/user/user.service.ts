import bcrypt from 'bcryptjs';
import type { Model } from 'mongoose';
import { User, type IUser } from './user.model.js';
//Auth owns these two collections; user.service erases them on account deletion.
import { Otp, Device } from '../auth/index.js';
import { appError, ErrorCode } from '../../shared/errors.js';
import { cleanText, checkTimezone } from '../../shared/validation.js';
import type { UpdateProfileInput, PreferencesInput } from './user.types.js';

//PROFILE AND ACCOUNT.

//Used by every function below, and exported because the `me` query needs it
//too. Having it once means the error code and message cannot drift apart
//between the places that look a user up.
export const getUser = async (id: string): Promise<IUser> => {
  const user = await User.findById(id);
  if (!user) throw appError(ErrorCode.ACCOUNT_NOT_FOUND, 'That account no longer exists.');
  return user;
};

//A number that must sit inside a range. Used by the goals below.
const inRange = (value: number, min: number, max: number, label: string): number => {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw appError(ErrorCode.BAD_USER_INPUT, `${label} is out of range.`);
  }
  return value;
};

export const updateProfile = async (userId: string, input: UpdateProfileInput): Promise<IUser> => {
  const user = await getUser(userId);

  //`!== undefined` matters: a field the app did not send must be left alone,
  //not overwritten with undefined.
  if (input.name !== undefined) user.name = cleanText(input.name, 80, 'Name');
  if (input.photoUrl !== undefined) user.photoUrl = input.photoUrl.trim();
  if (input.gender !== undefined) user.gender = input.gender;
  if (input.heightCm !== undefined) user.heightCm = inRange(input.heightCm, 50, 260, 'Height');
  if (input.weightKg !== undefined) user.weightKg = inRange(input.weightKg, 20, 400, 'Weight');

  if (input.birthDate !== undefined) {
    const parsed = new Date(input.birthDate);
    if (Number.isNaN(parsed.getTime()) || parsed > new Date()) {
      throw appError(ErrorCode.BAD_USER_INPUT, 'That date of birth is not valid.');
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
  if (input.cycleTrackingEnabled !== undefined) user.cycleTrackingEnabled = input.cycleTrackingEnabled;
  if (input.waterGoalGlasses !== undefined) {
    user.waterGoalGlasses = inRange(input.waterGoalGlasses, 1, 30, 'Water goal');
  }
  if (input.stepGoal !== undefined) user.stepGoal = inRange(input.stepGoal, 500, 100_000, 'Step goal');
  if (input.sleepGoalHours !== undefined) {
    user.sleepGoalHours = inRange(input.sleepGoalHours, 3, 14, 'Sleep goal');
  }

  await user.save();
  return user;
};

//DELETE AN ACCOUNT AND EVERYTHING IT OWNS.
//
//WHEN YOU ADD A NEW MODEL that has a `user` field, add it to this list. A
//model left out means the user's health data stays in the database after they
//asked for it to be gone — a data-protection problem, not an untidiness one.
//Typed as a plain Model list so the loop below type-checks across different
//document shapes — every one of them has a `user` field, which is all we need.
const USER_OWNED: Model<{ user: unknown }>[] = [Otp, Device] as unknown as Model<{ user: unknown }>[];

export const deleteAccount = async (userId: string, password: string): Promise<boolean> => {
  const user = await getUser(userId);

  //The password is required even though the caller holds a valid session. A
  //phone left unlocked on a table should not be one tap from erasing someone's
  //health history.
  if (!(await bcrypt.compare(password, user.passwordHash))) {
    throw appError(ErrorCode.WRONG_PASSWORD, 'That password is not right.');
  }

  //Owned rows first, the account last. In that order a failure part-way leaves
  //an account with some data missing, which the user can retry. The other way
  //round leaves orphaned health data with no account to delete it from.
  for (const Model of USER_OWNED) {
    await Model.deleteMany({ user: user._id });
  }

  await User.deleteOne({ _id: user._id });
  return true;
};

//Derived, never stored. A stored BMI goes stale the moment a weight is logged,
//and then two numbers in the app disagree.
export const calculateBMI = (heightCm: number | null, weightKg: number | null): number | null => {
  if (!heightCm || !weightKg) return null;
  const metres = heightCm / 100;
  return Math.round((weightKg / (metres * metres)) * 10) / 10;
};
