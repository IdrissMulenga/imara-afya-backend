import { isValidObjectId } from 'mongoose';
import type { IUser } from '../user/index.js';
import { CheckIn, type ICheckIn } from './checkin.model.js';
import { appError, ErrorCode } from '../../shared/errors.js';
import { cleanText, inRange } from '../../shared/validation.js';
import { addDays, dayInZone, streakLength } from '../../shared/datetime.js';
import { countOr, mean, roundTo } from '../../shared/numbers.js';
import type {
  CheckInAverages,
  CheckInDay,
  CheckInEntry,
  CheckInSummary,
  LogCheckInInput,
} from './checkin.types.js';

const NOTE_MAX = 500;
//Most check-ins one user can log in a day.
const MAX_PER_DAY = 10;
//How far back a check-in can be deleted.
const MAX_DELETE_AGE_DAYS = 30;
//How many days of history the streak is computed from.
const STREAK_WINDOW_DAYS = 365;
const WEEK_DAYS = 7;
const MONTH_DAYS = 30;
const HISTORY_DEFAULT_DAYS = 30;
const HISTORY_MAX_DAYS = 90;

const FIELDS = 'day at mood energy note createdAt';

type Log = Pick<ICheckIn, '_id' | 'day' | 'at' | 'mood' | 'energy' | 'note' | 'createdAt'>;

const toEntry = (log: Log): CheckInEntry => ({
  id: String(log._id),
  day: log.day,
  at: (log.at ?? log.createdAt).toISOString(),
  mood: log.mood,
  energy: log.energy,
  note: log.note ?? '',
});

//Groups check-ins by day, newest day first, each with its average mood and energy.
const byDay = (logs: Log[]): CheckInDay[] => {
  const days = new Map<string, CheckInEntry[]>();
  for (const log of logs) {
    const list = days.get(log.day) ?? [];
    list.push(toEntry(log));
    days.set(log.day, list);
  }
  return [...days.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([day, entries]) => ({
      day,
      mood: roundTo(mean(entries.map((entry) => entry.mood)), 1),
      energy: roundTo(mean(entries.map((entry) => entry.energy)), 1),
      entries: entries.sort((a, b) => (a.at < b.at ? 1 : -1)),
    }));
};

//Averages of the daily averages over the last `window` days, so a day with many
//check-ins counts the same as a day with one.
const averages = (days: CheckInDay[], today: string, window: number): CheckInAverages => {
  const oldest = addDays(today, -(window - 1));
  const inWindow = days.filter((day) => day.day >= oldest && day.day <= today);
  if (inWindow.length === 0) return { days: window, count: 0, mood: null, energy: null };
  return {
    days: window,
    count: inWindow.length,
    mood: roundTo(mean(inWindow.map((day) => day.mood)), 1),
    energy: roundTo(mean(inWindow.map((day) => day.energy)), 1),
  };
};

//Logs a new check-in for now, up to MAX_PER_DAY a day.
export const logCheckIn = async (user: IUser, input: LogCheckInInput): Promise<CheckInEntry> => {
  const now = new Date();
  const day = dayInZone(now, user.timezone);
  const mood = inRange(input.mood, 1, 5, 'mood');
  const energy = inRange(input.energy, 1, 5, 'energy');
  const note = input.note != null ? cleanText(input.note, NOTE_MAX, 'note') : '';

  const already = await CheckIn.countDocuments({ user: user._id, day });
  if (already >= MAX_PER_DAY) {
    throw appError(
      ErrorCode.BAD_USER_INPUT,
      `You have reached today's limit of ${MAX_PER_DAY} check-ins.`,
      { reason: 'CHECK_IN_LIMIT', max: MAX_PER_DAY }
    );
  }

  const saved = await CheckIn.create({ user: user._id, day, at: now, mood, energy, note });
  return toEntry(saved);
};

//Removes one check-in from the last 30 days. Returns false if there was none.
export const deleteCheckIn = async (user: IUser, id: string): Promise<boolean> => {
  if (!isValidObjectId(id)) return false;
  const oldest = addDays(dayInZone(new Date(), user.timezone), -MAX_DELETE_AGE_DAYS);
  const result = await CheckIn.deleteOne({ _id: id, user: user._id, day: { $gte: oldest } });
  return result.deletedCount > 0;
};

//Today's check-ins, the run of consecutive days checked in, and 7- and 30-day averages.
export const getSummary = async (user: IUser): Promise<CheckInSummary> => {
  const today = dayInZone(new Date(), user.timezone);

  const logs = await CheckIn.find({
    user: user._id,
    day: { $gte: addDays(today, -STREAK_WINDOW_DAYS), $lte: today },
  })
    .select(FIELDS)
    .sort({ day: -1, at: -1 })
    .limit((STREAK_WINDOW_DAYS + 1) * MAX_PER_DAY)
    .lean<Log[]>();

  const days = byDay(logs);
  const todays = days.find((day) => day.day === today)?.entries ?? [];

  return {
    today: todays,
    latest: todays[0] ?? null,
    streak: streakLength(
      days.map((day) => day.day),
      today
    ),
    week: averages(days, today, WEEK_DAYS),
    month: averages(days, today, MONTH_DAYS),
  };
};

//Days with check-ins in the last `days` days, newest first, each with its entries.
export const getHistory = async (user: IUser, days?: number | null): Promise<CheckInDay[]> => {
  const count = countOr(days, HISTORY_DEFAULT_DAYS, HISTORY_MAX_DAYS);

  const today = dayInZone(new Date(), user.timezone);
  const oldest = addDays(today, -(count - 1));

  const logs = await CheckIn.find({ user: user._id, day: { $gte: oldest, $lte: today } })
    .select(FIELDS)
    .sort({ day: -1, at: -1 })
    .limit(count * MAX_PER_DAY)
    .lean<Log[]>();

  return byDay(logs);
};
