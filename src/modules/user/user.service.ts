import type { Model } from 'mongoose';
import { User, type IUser } from './user.model.js';
import { Otp, Device } from '../auth/index.js';
import { clearAvatar } from '../upload/index.js';
import { appError, ErrorCode } from '../../shared/errors.js';
import { passwordMatches } from '../../shared/password.js';
import { roundTo } from '../../shared/numbers.js';
import { cleanText, checkClockTime, checkTimezone, inRange } from '../../shared/validation.js';
import { HabitLog } from '../habit/index.js';
import { CheckIn } from '../checkin/index.js';
import { CycleDay, CyclePeriod } from '../cycle/index.js';
import type { UpdateProfileInput, PreferencesInput } from './user.types.js';

//Loads a user or throws ACCOUNT_NOT_FOUND.
export const getUser = async (id: string): Promise<IUser> => {
  const user = await User.findById(id);
  if (!user) throw appError(ErrorCode.ACCOUNT_NOT_FOUND, 'That account no longer exists.');
  return user;
};

//null clears a field; any other value is checked.
const orNull = <T, R>(value: T | null, check: (value: T) => R): R | null =>
  value === null ? null : check(value);

const clockTime = (value: string | null) => orNull(value, checkClockTime);

//Updates the given profile fields; null clears height, weight or birth date.
export const updateProfile = async (user: IUser, input: UpdateProfileInput): Promise<IUser> => {
  if (input.name !== undefined) user.name = cleanText(input.name, 80, 'name');
  if (input.gender !== undefined) user.gender = input.gender;
  if (input.heightCm !== undefined) {
    user.heightCm = orNull(input.heightCm, (cm) => inRange(cm, 50, 260, 'height'));
  }
  if (input.weightKg !== undefined) {
    user.weightKg = orNull(input.weightKg, (kg) => inRange(kg, 20, 400, 'weight'));
  }
  if (input.birthDate !== undefined) {
    user.birthDate = orNull(input.birthDate, (raw) => {
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime()) || parsed > new Date()) {
        throw appError(ErrorCode.BAD_USER_INPUT, 'That date of birth is not valid.', {
          reason: 'INVALID_BIRTH_DATE',
        });
      }
      return parsed;
    });
  }

  await user.save();
  return user;
};

//Updates language, units, timezone, goals and the sleep schedule.
export const setPreferences = async (user: IUser, input: PreferencesInput): Promise<IUser> => {
  if (input.language !== undefined) user.language = input.language;
  if (input.units !== undefined) user.units = input.units;
  if (input.timezone !== undefined) user.timezone = checkTimezone(input.timezone);
  if (input.cycleTrackingEnabled !== undefined) {
    user.cycleTrackingEnabled = input.cycleTrackingEnabled;
  }
  if (input.waterGoalGlasses !== undefined) {
    user.waterGoalGlasses = inRange(input.waterGoalGlasses, 1, 30, 'waterGoal');
  }
  if (input.stepGoal !== undefined) {
    user.stepGoal = inRange(input.stepGoal, 500, 100_000, 'stepGoal');
  }
  if (input.sleepGoalHours !== undefined) {
    user.sleepGoalHours = inRange(input.sleepGoalHours, 3, 14, 'sleepGoal');
  }
  if (input.sleepBedtime !== undefined) user.sleepBedtime = clockTime(input.sleepBedtime);
  if (input.sleepWakeTime !== undefined) user.sleepWakeTime = clockTime(input.sleepWakeTime);
  if (input.sleepWeekendBedtime !== undefined) {
    user.sleepWeekendBedtime = clockTime(input.sleepWeekendBedtime);
  }
  if (input.sleepWeekendWakeTime !== undefined) {
    user.sleepWeekendWakeTime = clockTime(input.sleepWeekendWakeTime);
  }

  await user.save();
  return user;
};

//Collections deleted along with the account.
const USER_OWNED = [Otp, Device, HabitLog, CheckIn, CyclePeriod, CycleDay] as unknown as Model<{
  user: unknown;
}>[];

//Deletes the account and all its data after checking the password.
export const deleteAccount = async (user: IUser, password: string): Promise<boolean> => {
  if (!(await passwordMatches(user, password))) {
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
  return roundTo(weightKg / (metres * metres), 1);
};
