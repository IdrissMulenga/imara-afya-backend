import { isValidObjectId } from 'mongoose';
import type { IUser } from '../user/index.js';
import { CheckIn, type ICheckIn } from './checkin.model.js';
import { appError, ErrorCode } from '../../shared/errors.js';
import { checkClientId, checkPastTime, cleanText, inRange } from '../../shared/validation.js';
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
//How far back a check-in can be dated (one saved offline and sent later).
const MAX_BACKDATE_DAYS = 7;
//MongoDB's duplicate key error.
const DUPLICATE_KEY = 11000;
//How many days of history the streak is computed from.
const STREAK_WINDOW_DAYS = 365;
const WEEK_DAYS = 7;
const MONTH_DAYS = 30;
const HISTORY_DEFAULT_DAYS = 30;
const HISTORY_MAX_DAYS = 90;

const FIELDS = 'day at mood energy note createdAt';
const DAY_MS = 24 * 60 * 60 * 1000;
const dailyLocks = new Map<string, Promise<void>>();

type Log = Pick<ICheckIn, '_id' | 'day' | 'at' | 'mood' | 'energy' | 'note' | 'createdAt'>;

export const canCreateCheckIn = (currentCount: number, limit: number): boolean =>
  currentCount < limit;

export const isWithinDeleteWindow = (at: Date, now: Date, days: number): boolean =>
  at.getTime() >= now.getTime() - days * DAY_MS;

//Serializes quota checks and writes for a user/day on the single API instance.
const withDailyLock = async <T>(key: string, action: () => Promise<T>): Promise<T> => {
  const previous = dailyLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  dailyLocks.set(key, current);

  await previous;
  try {
    return await action();
  } finally {
    release();
    if (dailyLocks.get(key) === current) dailyLocks.delete(key);
  }
};

const deleteWindowFilter = (cutoff: Date) => ({
  $or: [{ at: { $gte: cutoff } }, { at: { $exists: false }, createdAt: { $gte: cutoff } }],
});

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

//The check-in already saved with this client id, if any.
const findByClientId = (user: IUser, clientId: string) =>
  CheckIn.findOne({ user: user._id, clientId }).select(FIELDS).lean<Log | null>();

//Logs a new check-in, now or at input.at, up to MAX_PER_DAY a day. A client id already used
//returns the check-in saved with it.
export const logCheckIn = async (user: IUser, input: LogCheckInInput): Promise<CheckInEntry> => {
  const at = input.at != null ? checkPastTime(input.at, MAX_BACKDATE_DAYS) : new Date();
  const day = dayInZone(at, user.timezone);
  const mood = inRange(input.mood, 1, 5, 'mood');
  const energy = inRange(input.energy, 1, 5, 'energy');
  const note = input.note != null ? cleanText(input.note, NOTE_MAX, 'note') : '';
  const clientId = input.clientId != null ? checkClientId(input.clientId) : null;

  if (clientId) {
    const existing = await findByClientId(user, clientId);
    if (existing) return toEntry(existing);
  }

  return withDailyLock(`${user._id}:${day}`, async () => {
    //Sent again while the first was being saved: return that one rather than count it.
    if (clientId) {
      const existing = await findByClientId(user, clientId);
      if (existing) return toEntry(existing);
    }
    const currentCount = await CheckIn.countDocuments({ user: user._id, day });
    if (!canCreateCheckIn(currentCount, MAX_PER_DAY)) {
      throw appError(
        ErrorCode.BAD_USER_INPUT,
        `You have reached today's limit of ${MAX_PER_DAY} check-ins.`,
        { reason: 'CHECK_IN_LIMIT', max: MAX_PER_DAY }
      );
    }

    try {
      const saved = await CheckIn.create({
        user: user._id,
        day,
        at,
        mood,
        energy,
        note,
        ...(clientId ? { clientId } : {}),
      });
      return toEntry(saved);
    } catch (error) {
      //The same check-in sent twice at once: return the one that was saved.
      if (clientId && (error as { code?: number }).code === DUPLICATE_KEY) {
        const existing = await findByClientId(user, clientId);
        if (existing) return toEntry(existing);
      }
      throw error;
    }
  });
};

//Removes one check-in from the last 30 days. Returns false if there was none.
export const deleteCheckIn = async (user: IUser, id: string): Promise<boolean> => {
  if (!isValidObjectId(id)) return false;

  const cutoff = new Date(Date.now() - MAX_DELETE_AGE_DAYS * DAY_MS);
  const filter = { _id: id, user: user._id, ...deleteWindowFilter(cutoff) };
  const checkIn = await CheckIn.findOne(filter).select({ day: 1 }).lean<{ day: string } | null>();
  if (!checkIn) return false;

  return withDailyLock(`${user._id}:${checkIn.day}`, async () => {
    const removed = await CheckIn.findOneAndDelete(filter).select({ _id: 1 }).lean();
    return removed !== null;
  });
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
