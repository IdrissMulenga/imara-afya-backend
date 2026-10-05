import type { IUser } from '../user/index.js';
import { HabitLog, type DataSource, type IHabitLog } from './habit.model.js';
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
  log?: Pick<
    IHabitLog,
    'waterGlasses' | 'steps' | 'sleepHours' | 'stepsSource' | 'sleepSource'
  > | null
): HabitDay => ({
  day,
  waterGlasses: log?.waterGlasses ?? 0,
  steps: log?.steps ?? null,
  sleepHours: log?.sleepHours ?? null,
  stepsSource: log?.steps != null ? (log.stepsSource ?? null) : null,
  sleepSource: log?.sleepHours != null ? (log.sleepSource ?? null) : null,
  sleepEstimated: log?.sleepHours != null && log.sleepSource === 'ESTIMATE',
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

//How much each source is trusted; a value replaces the stored one only from a source ranked at
//least as high. A value saved before sources were recorded ranks as PHONE.
export const STEPS_RANK: Partial<Record<DataSource, number>> = { BAND: 3, PHONE: 2 };
export const SLEEP_RANK: Record<DataSource, number> = { MANUAL: 4, BAND: 3, PHONE: 2, ESTIMATE: 1 };
const LEGACY_RANK = 2;

//The stored value's rank, read inside the update so two phones syncing at once cannot overwrite
//each other: 0 with no value, LEGACY_RANK with a value but no source.
const storedRank = (
  valueField: string,
  sourceField: string,
  ranks: Partial<Record<DataSource, number>>
) => ({
  $switch: {
    branches: Object.entries(ranks).map(([source, rank]) => ({
      case: { $eq: [`$${sourceField}`, source] },
      then: rank,
    })),
    default: { $cond: [{ $eq: [{ $ifNull: [`$${valueField}`, null] }, null] }, 0, LEGACY_RANK] },
  },
});

//Checks a value's source against the sources allowed for it; PHONE when missing.
const checkSource = (
  source: DataSource | null | undefined,
  ranks: Partial<Record<DataSource, number>>,
  field: 'steps' | 'sleep'
): DataSource => {
  const value = source ?? 'PHONE';
  if (!(value in ranks)) {
    throw appError(ErrorCode.BAD_USER_INPUT, `That source cannot send ${field}.`, {
      reason: 'INVALID_SOURCE',
      field,
    });
  }
  return value;
};

type DeviceValues = {
  steps?: { value: number; source: DataSource };
  sleep?: { value: number; source: DataSource };
};

//The update for one day: each value is kept from the higher-ranked source. On a tie, steps keep the
//higher count (the phone carried most) and sleep takes the new value.
const deviceUpdate = ({ steps, sleep }: DeviceValues) => {
  const set: Record<string, unknown> = {
    waterGlasses: { $ifNull: ['$waterGlasses', 0] },
    createdAt: { $ifNull: ['$createdAt', '$$NOW'] },
    updatedAt: '$$NOW',
  };
  if (steps) {
    const incoming = STEPS_RANK[steps.source] as number;
    const stored = storedRank('steps', 'stepsSource', STEPS_RANK);
    set.steps = {
      $cond: [
        { $gt: [incoming, stored] },
        steps.value,
        { $cond: [{ $eq: [incoming, stored] }, { $max: ['$steps', steps.value] }, '$steps'] },
      ],
    };
    set.stepsSource = {
      $cond: [{ $gte: [incoming, stored] }, { $literal: steps.source }, '$stepsSource'],
    };
  }
  if (sleep) {
    const incoming = SLEEP_RANK[sleep.source];
    const stored = storedRank('sleepHours', 'sleepSource', SLEEP_RANK);
    set.sleepHours = { $cond: [{ $gte: [incoming, stored] }, sleep.value, '$sleepHours'] };
    set.sleepSource = {
      $cond: [{ $gte: [incoming, stored] }, { $literal: sleep.source }, '$sleepSource'],
    };
  }
  return [{ $set: set }];
};

//Writes daily steps and sleep from the account's devices. Values are totals, so a retried sync
//changes nothing; a value from a lower-ranked source than the stored one is ignored. Days in the
//future or more than MAX_BACKDATE_DAYS ago are skipped.
export const syncDeviceDays = async (
  user: IUser,
  entries: DeviceDayInput[]
): Promise<DeviceSyncResult> => {
  const today = dayInZone(new Date(), user.timezone);
  const oldest = addDays(today, -MAX_BACKDATE_DAYS);

  const byDay = new Map<string, DeviceValues>();
  let skippedDays = 0;

  for (const entry of entries) {
    const day = checkDay(entry.day);
    if (day > today || day < oldest) {
      skippedDays += 1;
      continue;
    }

    const values = byDay.get(day) ?? {};
    if (entry.steps != null) {
      values.steps = {
        value: Math.round(inRange(entry.steps, 0, MAX_STEPS, 'steps')),
        source: checkSource(entry.stepsSource, STEPS_RANK, 'steps'),
      };
    }
    if (entry.sleepHours != null) {
      values.sleep = {
        value: roundTo(inRange(entry.sleepHours, 0, MAX_SLEEP, 'sleep'), 2),
        source: checkSource(entry.sleepSource, SLEEP_RANK, 'sleep'),
      };
    }
    byDay.set(day, values);
  }

  const days = [...byDay].filter(([, values]) => values.steps || values.sleep);
  await Promise.all(
    days.map(([day, values]) =>
      upsertWithRetry(() =>
        HabitLog.updateOne({ user: user._id, day }, deviceUpdate(values), {
          upsert: true,
          updatePipeline: true,
          timestamps: false,
        })
      )
    )
  );

  return { syncedDays: days.length, skippedDays };
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
      //Nights estimated from the schedule do not count toward the sleep streak.
      sleep: metGoal(
        (log) => (log.sleepSource === 'ESTIMATE' ? null : log.sleepHours),
        user.sleepGoalHours
      ),
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
