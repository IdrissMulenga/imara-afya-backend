import type { IUser } from '../user/index.js';
import { WeightLog } from './weight.model.js';
import { checkDay, inRange, resolveDay } from '../../shared/validation.js';
import { addDays, dayInZone } from '../../shared/datetime.js';
import { calculateBMI, countOr, roundTo } from '../../shared/numbers.js';
import { upsertWithRetry } from '../../shared/upsert.js';
import type { LogWeightInput, WeightEntry } from './weight.types.js';

const MIN_KG = 20;
const MAX_KG = 400;
//How far back a day can be logged.
const MAX_BACKDATE_DAYS = 365;
const HISTORY_DEFAULT_DAYS = 90;
const HISTORY_MAX_DAYS = 365;

const toEntry = (user: IUser, day: string, kg: number): WeightEntry => ({
  day,
  kg,
  bmi: calculateBMI(user.heightCm, kg),
});

const checkKg = (kg: number): number => roundTo(inRange(kg, MIN_KG, MAX_KG, 'weight'), 1);

const saveDay = (user: IUser, day: string, kg: number) =>
  upsertWithRetry(() =>
    WeightLog.findOneAndUpdate(
      { user: user._id, day },
      { $set: { kg } },
      { upsert: true, returnDocument: 'after', runValidators: true }
    ).lean()
  );

//Sets the profile's weightKg to the newest logged day, if there is one.
const syncProfile = async (user: IUser): Promise<void> => {
  const latest = await WeightLog.findOne({ user: user._id }).sort({ day: -1 }).lean();
  if (latest && user.weightKg !== latest.kg) {
    user.weightKg = latest.kg;
    await user.save();
  }
};

//Saves the weight for a day (today by default) and keeps the profile weight on the newest day.
export const logWeight = async (user: IUser, input: LogWeightInput): Promise<WeightEntry> => {
  const day = resolveDay(input.day, user.timezone, MAX_BACKDATE_DAYS);
  const kg = checkKg(input.kg);
  await saveDay(user, day, kg);
  await syncProfile(user);
  return toEntry(user, day, kg);
};

//Records a weight set on the profile as today's entry.
export const recordProfileWeight = async (user: IUser, kg: number): Promise<void> => {
  await saveDay(user, dayInZone(new Date(), user.timezone), roundTo(kg, 1));
};

//Removes one day's weight. Returns false if there was none.
export const deleteWeight = async (user: IUser, rawDay: string): Promise<boolean> => {
  const day = checkDay(rawDay);
  const result = await WeightLog.deleteOne({ user: user._id, day });
  if (result.deletedCount === 0) return false;
  await syncProfile(user);
  return true;
};

//Logged weights in the last `days` days, newest first.
export const getHistory = async (user: IUser, days?: number | null): Promise<WeightEntry[]> => {
  const count = countOr(days, HISTORY_DEFAULT_DAYS, HISTORY_MAX_DAYS);
  const today = dayInZone(new Date(), user.timezone);
  const oldest = addDays(today, -(count - 1));

  const logs = await WeightLog.find({ user: user._id, day: { $gte: oldest, $lte: today } })
    .sort({ day: -1 })
    .limit(count)
    .lean();

  return logs.map((log) => toEntry(user, log.day, log.kg));
};
