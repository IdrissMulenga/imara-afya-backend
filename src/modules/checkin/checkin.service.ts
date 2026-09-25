import type { IUser } from '../user/index.js';
import { CheckIn, type ICheckIn } from './checkin.model.js';
import { cleanText, inRange, resolveDay } from '../../shared/validation.js';
import { addDays, dayInZone, streakLength } from '../../shared/datetime.js';
import type {
  CheckInAverages,
  CheckInDay,
  CheckInSummary,
  LogCheckInInput,
} from './checkin.types.js';

const NOTE_MAX = 500;

//How far back a day can be logged or deleted.
const MAX_BACKDATE_DAYS = 30;
//How many days of history the streak is computed from.
const STREAK_WINDOW_DAYS = 365;
const WEEK_DAYS = 7;
const MONTH_DAYS = 30;
const HISTORY_DEFAULT_DAYS = 30;
const HISTORY_MAX_DAYS = 90;

const round1 = (value: number): number => Math.round(value * 10) / 10;

const toCheckInDay = (log: Pick<ICheckIn, 'day' | 'mood' | 'energy' | 'note'>): CheckInDay => ({
  day: log.day,
  mood: log.mood,
  energy: log.energy,
  note: log.note ?? '',
});

//Mood and energy averaged over the check-ins from the last `days` days.
const averages = (
  logs: Pick<ICheckIn, 'day' | 'mood' | 'energy'>[],
  today: string,
  days: number
): CheckInAverages => {
  const oldest = addDays(today, -(days - 1));
  const inWindow = logs.filter((log) => log.day >= oldest && log.day <= today);
  if (inWindow.length === 0) return { days, count: 0, mood: null, energy: null };

  const sum = (pick: (log: (typeof inWindow)[number]) => number) =>
    inWindow.reduce((total, log) => total + pick(log), 0);

  return {
    days,
    count: inWindow.length,
    mood: round1(sum((log) => log.mood) / inWindow.length),
    energy: round1(sum((log) => log.energy) / inWindow.length),
  };
};

//Creates or replaces the check-in for one day.
export const logCheckIn = async (user: IUser, input: LogCheckInInput): Promise<CheckInDay> => {
  const day = resolveDay(input.day, user.timezone, MAX_BACKDATE_DAYS);

  const set: Partial<Pick<ICheckIn, 'mood' | 'energy' | 'note'>> = {
    mood: inRange(input.mood, 1, 5, 'mood'),
    energy: inRange(input.energy, 1, 5, 'energy'),
  };
  if (input.note != null) set.note = cleanText(input.note, NOTE_MAX, 'note');

  const saved = await CheckIn.findOneAndUpdate(
    { user: user._id, day },
    { $set: set, $setOnInsert: 'note' in set ? {} : { note: '' } },
    { upsert: true, returnDocument: 'after', runValidators: true }
  ).lean();

  return toCheckInDay(saved!);
};

//Removes the check-in for one day. Returns false if there was none.
export const deleteCheckIn = async (user: IUser, rawDay?: string | null): Promise<boolean> => {
  const day = resolveDay(rawDay, user.timezone, MAX_BACKDATE_DAYS);
  const result = await CheckIn.deleteOne({ user: user._id, day });
  return result.deletedCount > 0;
};

//Today's check-in, the run of consecutive days checked in, and 7- and 30-day averages.
export const getSummary = async (user: IUser): Promise<CheckInSummary> => {
  const today = dayInZone(new Date(), user.timezone);

  const logs = await CheckIn.find({
    user: user._id,
    day: { $gte: addDays(today, -STREAK_WINDOW_DAYS), $lte: today },
  })
    .select('day mood energy note')
    .sort({ day: -1 })
    .limit(STREAK_WINDOW_DAYS + 1)
    .lean();

  const todays = logs.find((log) => log.day === today);

  return {
    today: todays ? toCheckInDay(todays) : null,
    streak: streakLength(
      logs.map((log) => log.day),
      today
    ),
    week: averages(logs, today, WEEK_DAYS),
    month: averages(logs, today, MONTH_DAYS),
  };
};

//Check-ins from the last `days` days, newest first. Days without one are omitted.
export const getHistory = async (user: IUser, days?: number | null): Promise<CheckInDay[]> => {
  const count =
    days == null || !Number.isFinite(days)
      ? HISTORY_DEFAULT_DAYS
      : Math.min(HISTORY_MAX_DAYS, Math.max(1, Math.floor(days)));

  const today = dayInZone(new Date(), user.timezone);
  const oldest = addDays(today, -(count - 1));

  const logs = await CheckIn.find({ user: user._id, day: { $gte: oldest, $lte: today } })
    .sort({ day: -1 })
    .limit(count)
    .lean();

  return logs.map(toCheckInDay);
};
