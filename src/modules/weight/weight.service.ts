import type { IUser } from '../user/index.js';
import { WeightLog } from './weight.model.js';
import { checkDay, inRange, resolveDay } from '../../shared/validation.js';
import { addDays, dayInZone, daysBetween } from '../../shared/datetime.js';
import { calculateBMI, countOr, roundTo } from '../../shared/numbers.js';
import { upsertWithRetry } from '../../shared/upsert.js';
import type { LogWeightInput, WeightEntry, WeightSummary } from './weight.types.js';

const MIN_KG = 20;
const MAX_KG = 400;
//How far back a day can be logged.
const MAX_BACKDATE_DAYS = 365;
const HISTORY_DEFAULT_DAYS = 90;
const HISTORY_MAX_DAYS = 365;
//Each day moves the trend this share of the way toward that day's weight.
const TREND_DAILY_SHARE = 0.1;
//Weights before a history window that settle the trend at its first day.
const TREND_WARMUP_DAYS = 60;
//The weekly change is measured over this many days, from at least MIN_CHANGE_WEIGHTS weights
//spanning at least MIN_CHANGE_SPAN_DAYS.
const CHANGE_WINDOW_DAYS = 28;
const MIN_CHANGE_WEIGHTS = 3;
const MIN_CHANGE_SPAN_DAYS = 7;

type Logged = { day: string; kg: number };

//The smoothed weight at each logged day, oldest first. A gap of several days moves the trend
//as far as that many daily steps would.
export const trendLine = (logs: Logged[]): (Logged & { trendKg: number })[] => {
  const sorted = [...logs].sort((a, b) => (a.day < b.day ? -1 : 1));
  let trend = 0;
  return sorted.map((log, i) => {
    if (i === 0) trend = log.kg;
    else {
      const gap = Math.max(1, daysBetween(sorted[i - 1].day, log.day));
      trend += (1 - (1 - TREND_DAILY_SHARE) ** gap) * (log.kg - trend);
    }
    return { ...log, trendKg: trend };
  });
};

//Change per week, from a straight line through the logged weights in the last
//CHANGE_WINDOW_DAYS ending `today` (the trend lags behind, so the weights themselves are used);
//null with too few weights or too short a span.
export const weeklyChange = (logs: Logged[], today: string): number | null => {
  const oldest = addDays(today, -(CHANGE_WINDOW_DAYS - 1));
  const recent = logs
    .filter((log) => log.day >= oldest && log.day <= today)
    .sort((a, b) => (a.day < b.day ? -1 : 1));
  if (recent.length < MIN_CHANGE_WEIGHTS) return null;

  const xs = recent.map((log) => daysBetween(oldest, log.day));
  if (xs[xs.length - 1] - xs[0] < MIN_CHANGE_SPAN_DAYS) return null;

  const meanX = xs.reduce((sum, x) => sum + x, 0) / xs.length;
  const meanY = recent.reduce((sum, log) => sum + log.kg, 0) / recent.length;
  let num = 0;
  let den = 0;
  recent.forEach((log, i) => {
    num += (xs[i] - meanX) * (log.kg - meanY);
    den += (xs[i] - meanX) ** 2;
  });
  return den === 0 ? null : roundTo((num / den) * 7, 2);
};

const toEntry = (user: IUser, day: string, kg: number, trendKg: number): WeightEntry => ({
  day,
  kg,
  bmi: calculateBMI(user.heightCm, kg),
  trendKg: roundTo(trendKg, 1),
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

//Logged weights from `oldest` to `newest`, with TREND_WARMUP_DAYS before them for the trend,
//oldest first.
const loadWithTrend = async (user: IUser, oldest: string, newest: string) => {
  const from = addDays(oldest, -TREND_WARMUP_DAYS);
  const span = daysBetween(from, newest) + 1;
  const logs = await WeightLog.find({ user: user._id, day: { $gte: from, $lte: newest } })
    .select('day kg')
    .sort({ day: -1 })
    .limit(span)
    .lean<Logged[]>();
  return trendLine(logs);
};

//Saves the weight for a day (today by default) and keeps the profile weight on the newest day.
export const logWeight = async (user: IUser, input: LogWeightInput): Promise<WeightEntry> => {
  const day = resolveDay(input.day, user.timezone, MAX_BACKDATE_DAYS);
  const kg = checkKg(input.kg);
  await saveDay(user, day, kg);
  await syncProfile(user);
  const point = (await loadWithTrend(user, day, day)).find((p) => p.day === day);
  return toEntry(user, day, kg, point?.trendKg ?? kg);
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

//Logged weights in the last `days` days with their trend, newest first.
export const getHistory = async (user: IUser, days?: number | null): Promise<WeightEntry[]> => {
  const count = countOr(days, HISTORY_DEFAULT_DAYS, HISTORY_MAX_DAYS);
  const today = dayInZone(new Date(), user.timezone);
  const oldest = addDays(today, -(count - 1));

  return (await loadWithTrend(user, oldest, today))
    .filter((point) => point.day >= oldest)
    .reverse()
    .map((point) => toEntry(user, point.day, point.kg, point.trendKg));
};

//The newest weight, the trend, its weekly change and the distance to the goal. The trend and the
//distance come only from weights in the trend window (about three months); an older newest weight
//is still returned, with its day, but says nothing about today.
export const getSummary = async (user: IUser): Promise<WeightSummary> => {
  const today = dayInZone(new Date(), user.timezone);
  const points = await loadWithTrend(user, addDays(today, -(CHANGE_WINDOW_DAYS - 1)), today);
  const recent = points[points.length - 1] ?? null;
  const goalKg = user.weightGoalKg ?? null;

  if (!recent) {
    const older = await WeightLog.findOne({ user: user._id })
      .sort({ day: -1 })
      .select('day kg')
      .lean<Logged>();
    return {
      latest: older ? toEntry(user, older.day, older.kg, older.kg) : null,
      trendKg: null,
      weeklyChangeKg: null,
      goalKg,
      toGoalKg: null,
    };
  }

  const trendKg = roundTo(recent.trendKg, 1);
  return {
    latest: toEntry(user, recent.day, recent.kg, recent.trendKg),
    trendKg,
    weeklyChangeKg: weeklyChange(points, today),
    goalKg,
    toGoalKg: goalKg != null ? roundTo(goalKg - trendKg, 1) : null,
  };
};
