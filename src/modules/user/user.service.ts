import type { Model } from 'mongoose';
import { User, type IUser } from './user.model.js';
import { Otp, Device } from '../auth/index.js';
import { clearAvatar } from '../upload/index.js';
import { appError, ErrorCode } from '../../shared/errors.js';
import { passwordMatches } from '../../shared/password.js';
import { cleanText, checkClockTime, checkTimezone, inRange } from '../../shared/validation.js';
import { roundTo } from '../../shared/numbers.js';
import { HabitLog } from '../habit/index.js';
import { CheckIn } from '../checkin/index.js';
import { CycleDay, CyclePeriod } from '../cycle/index.js';
import { Band } from '../band/index.js';
import { WeightLog, recordProfileWeight } from '../weight/index.js';
import type { UpdateProfileInput, PreferencesInput } from './user.types.js';

//Loads a user or throws ACCOUNT_NOT_FOUND.
export const getUser = async (id: string): Promise<IUser> => {
  const user = await User.findById(id);
  if (!user || user.deletedAt)
    throw appError(ErrorCode.ACCOUNT_NOT_FOUND, 'That account no longer exists.');
  return user;
};

//Earliest birth year accepted.
const MIN_BIRTH_YEAR = 1900;

//null clears a field; any other value is checked.
const orNull = <T, R>(value: T | null, check: (value: T) => R): R | null =>
  value === null ? null : check(value);

const clockTime = (value: string | null) => orNull(value, checkClockTime);

//Updates the given profile fields; null clears height, weight or birth date. A new weight is
//also logged as today's entry in the weight history.
export const updateProfile = async (user: IUser, input: UpdateProfileInput): Promise<IUser> => {
  if (input.name != null) user.name = cleanText(input.name, 80, 'name');
  if (input.gender != null) user.gender = input.gender;
  if (input.heightCm !== undefined) {
    user.heightCm = orNull(input.heightCm, (cm) => inRange(cm, 50, 260, 'height'));
  }
  if (input.weightKg !== undefined) {
    user.weightKg = orNull(input.weightKg, (kg) => inRange(kg, 20, 400, 'weight'));
  }
  if (input.birthDate !== undefined) {
    user.birthDate = orNull(input.birthDate, (raw) => {
      const parsed = new Date(raw);
      if (
        Number.isNaN(parsed.getTime()) ||
        parsed > new Date() ||
        parsed.getUTCFullYear() < MIN_BIRTH_YEAR
      ) {
        throw appError(ErrorCode.BAD_USER_INPUT, 'That date of birth is not valid.', {
          reason: 'INVALID_BIRTH_DATE',
        });
      }
      return parsed;
    });
  }

  await user.save();
  if (input.weightKg != null && user.weightKg != null) {
    await recordProfileWeight(user, user.weightKg);
  }
  return user;
};

//Updates language, units, timezone, goals (water, steps, sleep, weight) and the sleep schedule.
export const setPreferences = async (user: IUser, input: PreferencesInput): Promise<IUser> => {
  //Missing or null leaves a setting as it is; only the sleep times can be cleared with null.
  if (input.language != null) user.language = input.language;
  if (input.units != null) user.units = input.units;
  if (input.timezone != null) user.timezone = checkTimezone(input.timezone);
  if (input.cycleTrackingEnabled != null) {
    user.cycleTrackingEnabled = input.cycleTrackingEnabled;
  }
  if (input.waterGoalGlasses != null) {
    user.waterGoalGlasses = inRange(input.waterGoalGlasses, 1, 30, 'waterGoal');
  }
  if (input.stepGoal != null) {
    user.stepGoal = inRange(input.stepGoal, 500, 100_000, 'stepGoal');
  }
  if (input.sleepGoalHours != null) {
    user.sleepGoalHours = inRange(input.sleepGoalHours, 3, 14, 'sleepGoal');
  }
  if (input.weightGoalKg !== undefined) {
    user.weightGoalKg = orNull(input.weightGoalKg, (kg) =>
      roundTo(inRange(kg, 20, 400, 'weightGoal'), 1)
    );
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
const USER_OWNED = [
  Otp,
  Device,
  HabitLog,
  CheckIn,
  CyclePeriod,
  CycleDay,
  Band,
  WeightLog,
] as unknown as Model<{
  user: unknown;
}>[];

//Accounts purgeDeletedUsers finishes per run.
const PURGE_BATCH = 50;

//Erases a user marked deleted: the avatar file, every owned collection, then the user row.
//Safe to repeat, so an interrupted erase can simply be run again.
const purgeUser = async (user: IUser): Promise<void> => {
  await clearAvatar(user);
  await Promise.all(USER_OWNED.map((Model) => Model.deleteMany({ user: user._id })));
  await User.deleteOne({ _id: user._id });
};

//Closes the account at once (signed out everywhere, unusable), then erases all its data.
//If erasing fails part-way, purgeDeletedUsers finishes it.
export const deleteAccount = async (user: IUser, password: string): Promise<boolean> => {
  if (!(await passwordMatches(user, password))) {
    throw appError(ErrorCode.WRONG_PASSWORD, 'That password is not right.');
  }

  user.deletedAt = new Date();
  user.tokenVersion += 1;
  await user.save();

  await purgeUser(user).catch((error) => {
    console.error('[user] account closed; erase will be retried:', error);
  });
  return true;
};

//Finishes erasing accounts whose deletion was interrupted. Returns how many were erased.
export const purgeDeletedUsers = async (): Promise<number> => {
  const users = await User.find({ deletedAt: { $ne: null } }).limit(PURGE_BATCH);
  let erased = 0;
  for (const user of users) {
    try {
      await purgeUser(user);
      erased += 1;
    } catch (error) {
      console.error('[user] could not finish erasing an account:', error);
    }
  }
  return erased;
};
