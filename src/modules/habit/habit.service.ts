import type { IUser } from '../user/index.js';
import { HabitLog, type IHabitLog } from './habit.model.js';
import { appError, ErrorCode } from '../../shared/errors.js';
import { checkDay, inRange, resolveDay } from '../../shared/validation.js';
import { addDays, dayInZone, streakLength } from '../../shared/datetime.js';
import { countOr, roundTo } from '../../shared/numbers.js';
import { upsertWithRetry } from '../../shared/upsert.js';
import type {
  AddWaterInput,
  DeviceDayInput,
  DeviceSyncResult,
  HabitDay,
  HabitSummary,
  LogHabitsInput,
} from './habit.types.js';

const MAX_WATER = 50;
const MAX_STEPS = 200_000;
const MAX_SLEEP = 24;

//How far back a day can be logged.
const MAX_BACKDATE_DAYS = 30;
//How many days of history streaks are computed from.
const STREAK_WINDOW_DAYS = 365;
const HISTORY_DEFAULT_DAYS = 7;
const HISTORY_MAX_DAYS = 90;

const toHabitDay = (
  day: string,
  log?: Pick<IHabitLog, 'waterGlasses' | 'steps' | 'sleepHours'> | null
): HabitDay => ({
  day,
  waterGlasses: log?.waterGlasses ?? 0,
  steps: log?.steps ?? null,
  sleepHours: log?.sleepHours ?? null,
});

//Sets the given values for one day, creating the day if needed.
export const logHabits = async (user: IUser, input: LogHabitsInput): Promise<HabitDay> => {
  const day = resolveDay(input.day, user.timezone, MAX_BACKDATE_DAYS);

  if ('steps' in input && input.steps != null) {
    throw appError(ErrorCode.BAD_USER_INPUT, 'Steps are synced from the connected device.', {
      reason: 'DEVICE_MANAGED',
      field: 'steps',
    });
  }
  if ('sleepHours' in input && input.sleepHours != null) {
    throw appError(ErrorCode.BAD_USER_INPUT, 'Sleep is synced from the connected device.', {
      reason: 'DEVICE_MANAGED',
      field: 'sleep',
    });
  }

  const set: Partial<Record<'waterGlasses', number>> = {};
  if (input.waterGlasses != null) {
    set.waterGlasses = roundTo(inRange(input.waterGlasses, 0, MAX_WATER, 'water'), 2);
  }

  if (Object.keys(set).length === 0) {
    const existing = await HabitLog.findOne({ user: user._id, day }).lean();
    return toHabitDay(day, existing);
  }

  const defaults = { waterGlasses: 0 };
  const setOnInsert = Object.fromEntries(Object.entries(defaults).filter(([key]) => !(key in set)));

  const saved = await upsertWithRetry(() =>
    HabitLog.findOneAndUpdate(
      { user: user._id, day },
      { $set: set, $setOnInsert: setOnInsert },
      { upsert: true, returnDocument: 'after', runValidators: true }
    ).lean()
  );

  return toHabitDay(day, saved);
};

//Writes the band's daily steps and sleep. Values are totals, so a retried sync changes nothing;
//days in the future or more than MAX_BACKDATE_DAYS ago are skipped.
export const syncDeviceDays = async (
  user: IUser,
  entries: DeviceDayInput[]
): Promise<DeviceSyncResult> => {
  const today = dayInZone(new Date(), user.timezone);
  const oldest = addDays(today, -MAX_BACKDATE_DAYS);

  const byDay = new Map<string, Partial<Record<'steps' | 'sleepHours', number>>>();
  let skippedDays = 0;

  for (const entry of entries) {
    const day = checkDay(entry.day);
    if (day > today || day < oldest) {
      skippedDays += 1;
      continue;
    }

    const set = byDay.get(day) ?? {};
    if (entry.steps != null) {
      set.steps = Math.round(inRange(entry.steps, 0, MAX_STEPS, 'steps'));
    }
    if (entry.sleepHours != null) {
      set.sleepHours = roundTo(inRange(entry.sleepHours, 0, MAX_SLEEP, 'sleep'), 2);
    }
    byDay.set(day, set);
  }

  const writes = [...byDay]
    .filter(([, set]) => Object.keys(set).length > 0)
    .map(([day, set]) => ({
      updateOne: {
        filter: { user: user._id, day },
        update: { $set: set, $setOnInsert: { waterGlasses: 0 } },
        upsert: true,
      },
    }));

  if (writes.length > 0) {
    await upsertWithRetry(() => HabitLog.bulkWrite(writes, { ordered: false }));
  }

  return { syncedDays: writes.length, skippedDays };
};

//Adds glasses of water to one day (negative removes), kept within 0..MAX_WATER.
export const addWater = async (user: IUser, input: AddWaterInput): Promise<HabitDay> => {
  const day = resolveDay(input.day, user.timezone, MAX_BACKDATE_DAYS);
  const delta = input.glasses;
  if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > MAX_WATER) {
    throw appError(ErrorCode.BAD_USER_INPUT, 'Water is out of range.', {
      reason: 'OUT_OF_RANGE',
      field: 'water',
    });
  }

  //One atomic update: concurrent taps all count and the total stays within 0..MAX_WATER.
  const saved = await upsertWithRetry(() =>
    HabitLog.findOneAndUpdate(
      { user: user._id, day },
      [
        {
          $set: {
            waterGlasses: {
              $min: [
                MAX_WATER,
                { $max: [0, { $add: [{ $ifNull: ['$waterGlasses', 0] }, delta] }] },
              ],
            },
            createdAt: { $ifNull: ['$createdAt', '$$NOW'] },
            updatedAt: '$$NOW',
          },
        },
      ],
      { upsert: true, returnDocument: 'after', updatePipeline: true, timestamps: false }
    ).lean()
  );

  return toHabitDay(day, saved);
};

//Today's numbers and, for each habit, how many consecutive days met the goal.
export const getSummary = async (user: IUser): Promise<HabitSummary> => {
  const today = dayInZone(new Date(), user.timezone);

  const logs = await HabitLog.find({
    user: user._id,
    day: { $gte: addDays(today, -STREAK_WINDOW_DAYS), $lte: today },
  })
    .sort({ day: -1 })
    .limit(STREAK_WINDOW_DAYS + 1)
    .lean();

  const metGoal = (getValue: (log: (typeof logs)[number]) => number | null, goal: number) =>
    streakLength(
      logs
        .filter((log) => {
          const value = getValue(log);
          return value != null && Number.isFinite(value) && value >= goal;
        })
        .map((log) => log.day),
      today
    );

  return {
    today: toHabitDay(
      today,
      logs.find((log) => log.day === today)
    ),
    streaks: {
      water: metGoal((log) => log.waterGlasses, user.waterGoalGlasses),
      steps: metGoal((log) => log.steps, user.stepGoal),
      sleep: metGoal((log) => log.sleepHours, user.sleepGoalHours),
    },
  };
};

//The last `days` days, newest first, with empty days filled in as zeros.
export const getHistory = async (user: IUser, days?: number | null): Promise<HabitDay[]> => {
  const count = countOr(days, HISTORY_DEFAULT_DAYS, HISTORY_MAX_DAYS);

  const today = dayInZone(new Date(), user.timezone);
  const oldest = addDays(today, -(count - 1));

  const logs = await HabitLog.find({ user: user._id, day: { $gte: oldest, $lte: today } })
    .sort({ day: -1 })
    .limit(count)
    .lean();

  const byDay = new Map(logs.map((log) => [log.day, log]));
  return Array.from({ length: count }, (_, i) => {
    const day = addDays(today, -i);
    return toHabitDay(day, byDay.get(day));
  });
};
