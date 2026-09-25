import type { IUser } from '../user/index.js';
import { HabitLog, type IHabitLog } from './habit.model.js';
import { appError, ErrorCode } from '../../shared/errors.js';
import { inRange, resolveDay } from '../../shared/validation.js';
import { addDays, dayInZone, streakLength } from '../../shared/datetime.js';
import type { AddWaterInput, HabitDay, HabitSummary, LogHabitsInput } from './habit.types.js';

const MAX_WATER = 50;
const MAX_STEPS = 200_000;
const MAX_SLEEP = 24;

//How far back a day can be logged.
const MAX_BACKDATE_DAYS = 30;
//How many days of history streaks are computed from.
const STREAK_WINDOW_DAYS = 365;
const HISTORY_DEFAULT_DAYS = 7;
const HISTORY_MAX_DAYS = 90;

const round2 = (value: number): number => Math.round(value * 100) / 100;

const toHabitDay = (
  day: string,
  log?: Pick<IHabitLog, 'waterGlasses' | 'steps' | 'sleepHours'> | null
): HabitDay => ({
  day,
  waterGlasses: log?.waterGlasses ?? 0,
  steps: log?.steps ?? 0,
  sleepHours: log?.sleepHours ?? 0,
});

//Sets the given values for one day, creating the day if needed.
export const logHabits = async (user: IUser, input: LogHabitsInput): Promise<HabitDay> => {
  const day = resolveDay(input.day, user.timezone, MAX_BACKDATE_DAYS);

  const set: Partial<Record<'waterGlasses' | 'steps' | 'sleepHours', number>> = {};
  if (input.waterGlasses != null) {
    set.waterGlasses = round2(inRange(input.waterGlasses, 0, MAX_WATER, 'water'));
  }
  if (input.steps != null) set.steps = Math.round(inRange(input.steps, 0, MAX_STEPS, 'steps'));
  if (input.sleepHours != null) {
    set.sleepHours = round2(inRange(input.sleepHours, 0, MAX_SLEEP, 'sleep'));
  }

  if (Object.keys(set).length === 0) {
    const existing = await HabitLog.findOne({ user: user._id, day }).lean();
    return toHabitDay(day, existing);
  }

  const defaults = { waterGlasses: 0, steps: 0, sleepHours: 0 };
  const setOnInsert = Object.fromEntries(Object.entries(defaults).filter(([key]) => !(key in set)));

  const saved = await HabitLog.findOneAndUpdate(
    { user: user._id, day },
    { $set: set, $setOnInsert: setOnInsert },
    { upsert: true, returnDocument: 'after', runValidators: true }
  ).lean();

  return toHabitDay(day, saved);
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

  //One atomic pipeline update, so concurrent taps are all counted and the
  //total can never go below 0 or above MAX_WATER.
  const saved = await HabitLog.findOneAndUpdate(
    { user: user._id, day },
    [
      {
        $set: {
          waterGlasses: {
            $min: [MAX_WATER, { $max: [0, { $add: [{ $ifNull: ['$waterGlasses', 0] }, delta] }] }],
          },
          steps: { $ifNull: ['$steps', 0] },
          sleepHours: { $ifNull: ['$sleepHours', 0] },
          createdAt: { $ifNull: ['$createdAt', '$$NOW'] },
          updatedAt: '$$NOW',
        },
      },
    ],
    { upsert: true, returnDocument: 'after', updatePipeline: true, timestamps: false }
  ).lean();

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

  const metGoal = (met: (log: (typeof logs)[number]) => boolean) =>
    streakLength(
      logs.filter(met).map((log) => log.day),
      today
    );

  return {
    today: toHabitDay(
      today,
      logs.find((log) => log.day === today)
    ),
    streaks: {
      water: metGoal((log) => log.waterGlasses >= user.waterGoalGlasses),
      steps: metGoal((log) => log.steps >= user.stepGoal),
      sleep: metGoal((log) => log.sleepHours >= user.sleepGoalHours),
    },
  };
};

//The last `days` days, newest first, with empty days filled in as zeros.
export const getHistory = async (user: IUser, days?: number | null): Promise<HabitDay[]> => {
  const count =
    days == null || !Number.isFinite(days)
      ? HISTORY_DEFAULT_DAYS
      : Math.min(HISTORY_MAX_DAYS, Math.max(1, Math.floor(days)));

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
