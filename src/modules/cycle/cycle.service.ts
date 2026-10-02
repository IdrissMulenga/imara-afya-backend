import { isValidObjectId } from 'mongoose';
import type { IUser } from '../user/index.js';
import { CycleDay, CyclePeriod, type ICycleDay, type ICyclePeriod } from './cycle.model.js';
import { appError, ErrorCode } from '../../shared/errors.js';
import { isDuplicateKey, upsertWithRetry } from '../../shared/upsert.js';
import { checkDay, cleanText, resolveDay } from '../../shared/validation.js';
import { median } from '../../shared/numbers.js';
import { addDays, dayInZone, daysBetween } from '../../shared/datetime.js';
import type {
  CycleDayInput,
  CycleDayOut,
  CycleNote,
  CyclePeriodOut,
  CyclePhase,
  CyclePrediction,
  CycleSummary,
  Symptom,
  SymptomPattern,
} from './cycle.types.js';

//How far back a period or a day can be logged.
const MAX_BACKDATE_DAYS = 90;
//Periods returned and looked at.
const HISTORY_LIMIT = 24;
//Recent cycles the typical lengths come from.
const TYPICAL_OVER = 6;
//Used until there is enough history.
const DEFAULT_CYCLE = 28;
const DEFAULT_PERIOD = 5;
//Lengths outside these are left out as unlikely.
const CYCLE_RANGE = [15, 60] as const;
const PERIOD_RANGE = [1, 15] as const;
//Ovulation is estimated this many days before the next period.
const LUTEAL_DAYS = 14;
//The fertile window: five days before ovulation to one day after.
const FERTILE_BEFORE = 5;
const FERTILE_AFTER = 1;
const PREDICTIONS = 3;
//Days either side of a prediction while there are not yet two cycles to go on.
const DEFAULT_MARGIN = 3;
const MAX_MARGIN = 7;
//Normal ranges (FIGO): cycles of 24-38 days varying by up to 9 days, periods up to 8 days.
const NORMAL_CYCLE = [24, 38] as const;
const NORMAL_VARIATION = 9;
const NORMAL_PERIOD = 8;
//Bleeding longer than this needs medical review (PROLONGED_BLEEDING).
const PROLONGED_DAYS = PERIOD_RANGE[1];
//A period this many days past its expected start counts as very late.
const VERY_LATE_DAYS = 7;
//Typical cycles since the latest start, with no log in RECENT_LOG_DAYS, before estimates stop.
const STALE_AFTER_CYCLES = 2;
const RECENT_LOG_DAYS = 30;
const NOTE_MAX = 300;
//Day logs a range query may return, and how many feed the symptom patterns.
const DAYS_LIMIT = 400;
const OPEN_PERIOD_LOG_LIMIT = DAYS_LIMIT + 1;
const PATTERN_LOGS = 240;
const PATTERN_MIN = 3;
const PATTERN_TOP = 4;

type Period = Pick<ICyclePeriod, '_id' | 'start' | 'end'>;
type DayLog = Pick<ICycleDay, 'day' | 'flow' | 'symptoms' | 'discharge' | 'note'>;

const inside = (value: number, [min, max]: readonly [number, number]) =>
  value >= min && value <= max;

const lengthOf = (start: string, end: string | null): number | null =>
  end ? daysBetween(start, end) + 1 : null;

const toDayOut = (log: DayLog): CycleDayOut => ({
  day: log.day,
  flow: log.flow,
  symptoms: log.symptoms ?? [],
  discharge: log.discharge ?? null,
  note: log.note ?? '',
});

const bleeding = (log: DayLog | undefined) =>
  !!log && log.flow !== 'NONE' && log.flow !== 'SPOTTING';

const continuationReachesSentinel = (end: string, logs: Map<string, DayLog>) =>
  logs.size > DAYS_LIMIT && [...logs.keys()][DAYS_LIMIT] === end;

const hasEndConfirmation = (end: string, logs: Map<string, DayLog>) => {
  const followingDay = logs.get(addDays(end, 1));
  return (
    !!followingDay &&
    !bleeding(followingDay) &&
    (followingDay.flow === 'SPOTTING' ||
      Boolean(followingDay.symptoms?.length || followingDay.discharge || followingDay.note?.trim()))
  );
};

//`end`, extended through the logged bleeding days that directly follow it.
const bleedingThrough = (end: string, logs: Map<string, DayLog>): string => {
  let last = end;
  while (bleeding(logs.get(addDays(last, 1)))) last = addDays(last, 1);
  return last;
};

//The day an open period is taken to end, extended through consecutive logged bleeding.
const openEnd = (start: string, typicalPeriod: number, logs: Map<string, DayLog>): string =>
  bleedingThrough(addDays(start, typicalPeriod - 1), logs);

const periodOngoingError = () =>
  appError(ErrorCode.BAD_USER_INPUT, 'A period is already in progress.', {
    reason: 'PERIOD_ONGOING',
  });

//The phase of `day` given the periods (oldest first) and typical lengths. After the latest
//period, a day past the expected next start plus margin is UNKNOWN: the period is overdue, and
//calling it LUTEAL would pass off possible early-pregnancy symptoms as premenstrual.
const phaseOn = (
  day: string,
  periods: { start: string; end: string }[],
  typicalCycle: number,
  margin: number
): CyclePhase => {
  let index = -1;
  for (let i = 0; i < periods.length && periods[i].start <= day; i++) index = i;
  if (index < 0) return 'UNKNOWN';
  const period = periods[index];
  if (day <= period.end) return 'MENSTRUAL';
  const following = periods[index + 1]?.start;
  const nextStart = following ?? addDays(period.start, typicalCycle);
  if (!following && day > addDays(nextStart, margin)) return 'UNKNOWN';
  const ovulation = addDays(nextStart, -LUTEAL_DAYS);
  if (day >= addDays(ovulation, -FERTILE_BEFORE) && day <= addDays(ovulation, FERTILE_AFTER)) {
    return 'FERTILE';
  }
  return day < ovulation ? 'FOLLICULAR' : 'LUTEAL';
};

const predictionFrom = (start: string, typicalPeriod: number, margin: number): CyclePrediction => {
  const ovulationDay = addDays(start, -LUTEAL_DAYS);
  return {
    start,
    end: addDays(start, typicalPeriod - 1),
    earliest: addDays(start, -margin),
    latest: addDays(start, margin),
    ovulationDay,
    fertileStart: addDays(ovulationDay, -FERTILE_BEFORE),
    fertileEnd: addDays(ovulationDay, FERTILE_AFTER),
  };
};

//Loads the recent periods and the typical period length (needed to close open periods).
const loadPeriods = async (user: IUser): Promise<Period[]> =>
  CyclePeriod.find({ user: user._id })
    .select('start end')
    .sort({ start: -1 })
    .limit(HISTORY_LIMIT)
    .lean<Period[]>();

const typicalPeriodOf = (periods: Period[]): number =>
  median(
    periods
      .map((p) => lengthOf(p.start, p.end))
      .filter((n): n is number => n != null && inside(n, PERIOD_RANGE))
      .slice(0, TYPICAL_OVER),
    DEFAULT_PERIOD
  );

//Starts a period on `day`, closing an open period only after its inferred end is confirmed.
export const startPeriod = async (user: IUser, rawDay?: string | null): Promise<CyclePeriodOut> => {
  const day = resolveDay(rawDay, user.timezone, MAX_BACKDATE_DAYS);
  const periods = await loadPeriods(user);
  const latest = periods[0];

  if (latest && day <= latest.start) {
    throw appError(ErrorCode.BAD_USER_INPUT, 'That day is before your latest logged period.', {
      reason: 'BEFORE_LATEST',
    });
  }

  const open = periods.find((p) => p.end == null);
  //The open period this request closed, and the end it was given, for undoing.
  let closed: { id: Period['_id']; end: string } | null = null;
  if (open) {
    const logs = await dayLogsBetween(user, open.start, day, 1, OPEN_PERIOD_LOG_LIMIT);
    const end = openEnd(open.start, typicalPeriodOf(periods), logs);
    if (
      day <= end ||
      continuationReachesSentinel(end, logs) ||
      (day > end && !hasEndConfirmation(end, logs))
    ) {
      throw periodOngoingError();
    }
    const result = await CyclePeriod.updateOne(
      { _id: open._id, user: user._id, end: null },
      { $set: { end } }
    );
    if (result.modifiedCount === 0) throw periodOngoingError();
    closed = { id: open._id, end };
  } else if (latest?.end && day <= latest.end) {
    throw appError(ErrorCode.BAD_USER_INPUT, 'That day is already part of a logged period.', {
      reason: 'PERIOD_OVERLAP',
    });
  }

  let saved: ICyclePeriod;
  try {
    saved = await CyclePeriod.create({ user: user._id, start: day, end: null });
  } catch (error) {
    //Reopens the period closed above, so a failed start changes nothing.
    if (closed) {
      await CyclePeriod.updateOne(
        { _id: closed.id, user: user._id, end: closed.end },
        { $set: { end: null } }
      ).catch((undo) => console.error('[cycle] could not reopen period after failed start:', undo));
    }
    if (isDuplicateKey(error)) throw periodOngoingError();
    throw error;
  }
  return {
    id: String(saved._id),
    start: saved.start,
    end: null,
    lengthDays: null,
    cycleLength: null,
  };
};

//Ends the open period on `day` (default today).
export const endPeriod = async (user: IUser, rawDay?: string | null): Promise<CyclePeriodOut> => {
  const day = resolveDay(rawDay, user.timezone, MAX_BACKDATE_DAYS);

  const open = await CyclePeriod.findOne({ user: user._id, end: null });
  if (!open) {
    throw appError(ErrorCode.BAD_USER_INPUT, 'There is no period in progress.', {
      reason: 'NO_PERIOD',
    });
  }
  if (day < open.start) {
    throw appError(ErrorCode.BAD_USER_INPUT, 'A period cannot end before it starts.', {
      reason: 'END_BEFORE_START',
    });
  }
  open.end = day;
  await open.save();
  return {
    id: String(open._id),
    start: open.start,
    end: day,
    lengthDays: lengthOf(open.start, day),
    cycleLength: null,
  };
};

//Removes one logged period. Returns false if there was none.
export const deletePeriod = async (user: IUser, id: string): Promise<boolean> => {
  if (!isValidObjectId(id)) return false;
  const result = await CyclePeriod.deleteOne({ _id: id, user: user._id });
  return result.deletedCount > 0;
};

//Day logs between two days (inclusive), keyed by day.
//Loads at most `limit` logs; newest first by default, or oldest first for open-period continuation.
const dayLogsBetween = async (
  user: IUser,
  from: string,
  to: string,
  sortOrder: 1 | -1 = -1,
  limit = DAYS_LIMIT
): Promise<Map<string, DayLog>> => {
  const logs = await CycleDay.find({ user: user._id, day: { $gte: from, $lte: to } })
    .select('day flow symptoms discharge note')
    .sort({ day: sortOrder })
    .limit(limit)
    .lean<DayLog[]>();
  return new Map(logs.map((log) => [log.day, log]));
};

//Sets one day's log; an empty log removes it and returns null.
export const logDay = async (user: IUser, input: CycleDayInput): Promise<CycleDayOut | null> => {
  const day = resolveDay(input.day, user.timezone, MAX_BACKDATE_DAYS);
  const flow = input.flow ?? 'NONE';
  const symptoms = [...new Set(input.symptoms ?? [])];
  const discharge = input.discharge ?? null;
  const note = input.note != null ? cleanText(input.note, NOTE_MAX, 'note') : '';

  if (flow === 'NONE' && !symptoms.length && !discharge && !note) {
    await CycleDay.deleteOne({ user: user._id, day });
    return null;
  }

  const saved = await upsertWithRetry(() =>
    CycleDay.findOneAndUpdate(
      { user: user._id, day },
      { $set: { flow, symptoms, discharge, note } },
      { upsert: true, returnDocument: 'after', runValidators: true }
    ).lean<DayLog>()
  );
  return toDayOut(saved!);
};

//Day logs from `from` to `to` (YYYY-MM-DD, inclusive), newest first; at most 400 days.
export const getDays = async (user: IUser, from: string, to: string): Promise<CycleDayOut[]> => {
  const end = checkDay(to);
  let start = checkDay(from);
  if (end < start) return [];
  if (daysBetween(start, end) > DAYS_LIMIT) start = addDays(end, -DAYS_LIMIT);
  const logs = await dayLogsBetween(user, start, end);
  return [...logs.values()].map(toDayOut);
};

//Periods, typical lengths, phase, next three predictions, notes, symptom patterns, today's log.
export const getSummary = async (user: IUser): Promise<CycleSummary> => {
  const today = dayInZone(new Date(), user.timezone);
  const periods = await loadPeriods(user);
  const oldestFirst = [...periods].reverse();

  const logs = await dayLogsBetween(user, addDays(today, -PATTERN_LOGS), today);

  const cycleLengths = oldestFirst
    .slice(1)
    .map((p, i) => daysBetween(oldestFirst[i].start, p.start));
  const usable = cycleLengths.filter((n) => inside(n, CYCLE_RANGE)).slice(-TYPICAL_OVER);
  const typicalCycle = median(usable, DEFAULT_CYCLE);
  const typicalPeriod = typicalPeriodOf(periods);
  const variation = usable.length >= 2 ? Math.max(...usable) - Math.min(...usable) : null;

  const open = periods.find((p) => p.end == null) ?? null;
  const openPeriodLogs = open
    ? await dayLogsBetween(user, open.start, today, 1, OPEN_PERIOD_LOG_LIMIT)
    : new Map<string, DayLog>();
  const patternPeriodLogs = new Map([...openPeriodLogs].slice(0, DAYS_LIMIT));
  //Closed periods run through any bleeding logged directly after their recorded end.
  const ends = oldestFirst.map((p) => ({
    start: p.start,
    end: p.end ? bleedingThrough(p.end, logs) : openEnd(p.start, typicalPeriod, patternPeriodLogs),
  }));
  const inferredCurrentEnd = open ? openEnd(open.start, typicalPeriod, openPeriodLogs) : null;
  const endUncertain =
    inferredCurrentEnd != null &&
    (continuationReachesSentinel(inferredCurrentEnd, openPeriodLogs) ||
      (today > inferredCurrentEnd && !hasEndConfirmation(inferredCurrentEnd, openPeriodLogs)));
  const currentEnd = endUncertain ? null : inferredCurrentEnd;

  const periodsOut: CyclePeriodOut[] = periods.map((p, i) => ({
    id: String(p._id),
    start: p.start,
    end: p.end ?? null,
    lengthDays: lengthOf(p.start, p.end),
    cycleLength: i > 0 ? daysBetween(p.start, periods[i - 1].start) : null,
  }));

  const latest = oldestFirst[oldestFirst.length - 1];
  //Estimates are stale when the latest period started over two typical cycles ago and nothing
  //has been logged for a month. The user may have stopped logging or stopped bleeding (pregnancy,
  //amenorrhoea); the server cannot tell which, so predictions are withheld but lateness is kept.
  const stale =
    !!latest &&
    daysBetween(latest.start, today) > STALE_AFTER_CYCLES * typicalCycle &&
    ![...logs.keys()].some((day) => day >= addDays(today, -RECENT_LOG_DAYS));
  const margin =
    variation == null
      ? DEFAULT_MARGIN
      : Math.min(MAX_MARGIN, Math.max(1, Math.ceil(variation / 2)));

  //Last day of bleeding in the latest period: its end extended through consecutive logged
  //bleeding days. An open period uses its inferred end, which only extends through logged
  //bleeding, so an unconfirmed end is never taken as bleeding. A separate later bleeding run
  //(spotting, an unlogged new period, bleeding in pregnancy) does not count.
  const lastBleedingDay = latest
    ? latest.end
      ? bleedingThrough(latest.end, logs)
      : inferredCurrentEnd
    : null;
  const latestBleedingSpan =
    latest && lastBleedingDay ? daysBetween(latest.start, lastBleedingDay) + 1 : 0;

  //The next period is expected a typical cycle after the latest start; when bleeding ran past
  //that day, a typical bleeding-free gap after the bleeding stopped.
  const typicalStart = latest ? addDays(latest.start, typicalCycle) : null;
  const expectedStart =
    typicalStart && lastBleedingDay && lastBleedingDay >= typicalStart
      ? addDays(lastBleedingDay, typicalCycle - typicalPeriod)
      : typicalStart;
  //Measured even when estimates are stale, so a missed period is always reported.
  const veryLate = !!expectedStart && daysBetween(expectedStart, today) >= VERY_LATE_DAYS;

  //While very late or after prolonged bleeding the regular schedule cannot be trusted: a
  //fertile window and future periods would mislead someone who may be pregnant or unwell.
  const unreliable = veryLate || latestBleedingSpan > PROLONGED_DAYS;

  //The first may already be late; the other two are always still to come. Only the first
  //is given while estimates are unreliable.
  const predictions: CyclePrediction[] = [];
  if (expectedStart && !stale) {
    predictions.push(predictionFrom(expectedStart, typicalPeriod, margin));
    let start = expectedStart;
    while (!unreliable && predictions.length < PREDICTIONS) {
      start = addDays(start, typicalCycle);
      if (start < today) continue;
      predictions.push(predictionFrom(start, typicalPeriod, margin));
    }
  }
  const next = predictions[0];
  const upcoming = next && !unreliable ? next : undefined;

  const notes: CycleNote[] = [];
  if (usable.length >= 3 && variation != null && variation > NORMAL_VARIATION)
    notes.push('IRREGULAR');
  if (usable.length >= 2 && typicalCycle < NORMAL_CYCLE[0]) notes.push('SHORT_CYCLES');
  if (usable.length >= 2 && typicalCycle > NORMAL_CYCLE[1]) notes.push('LONG_CYCLES');
  const recentLengths = periods
    .slice(0, 3)
    .map((p) => lengthOf(p.start, p.end))
    .filter((n): n is number => n != null);
  if (recentLengths.some((n) => n > NORMAL_PERIOD) || latestBleedingSpan > NORMAL_PERIOD) {
    notes.push('LONG_PERIODS');
  }
  //Only the latest period, so the note matches the withheld estimates and clears with the next.
  if (latestBleedingSpan > PROLONGED_DAYS) notes.push('PROLONGED_BLEEDING');
  if (veryLate) notes.push('VERY_LATE');

  //Symptom patterns: for each symptom logged at least three times, its most common phase.
  const byPhase = new Map<Symptom, Map<CyclePhase, number>>();
  for (const log of logs.values()) {
    const phase =
      endUncertain && open && log.day >= open.start
        ? 'UNKNOWN'
        : phaseOn(log.day, ends, typicalCycle, margin);
    if (phase === 'UNKNOWN') continue;
    for (const symptom of log.symptoms ?? []) {
      const counts = byPhase.get(symptom) ?? new Map<CyclePhase, number>();
      counts.set(phase, (counts.get(phase) ?? 0) + 1);
      byPhase.set(symptom, counts);
    }
  }
  const patterns: SymptomPattern[] = [...byPhase.entries()]
    .map(([symptom, counts]) => {
      const total = [...counts.values()].reduce((t, n) => t + n, 0);
      const [phase, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      return { symptom, phase, count, share: Math.round((count / total) * 100) / 100, total };
    })
    .filter((p) => p.total >= PATTERN_MIN)
    .sort((a, b) => b.total - a.total)
    .slice(0, PATTERN_TOP)
    .map(({ symptom, phase, count, share }) => ({ symptom, phase, count, share }));

  const todayLog = logs.get(today);

  //Logged bleeding is a fact and stays MENSTRUAL; estimated phases are hidden when unreliable.
  const estimatedPhase = phaseOn(today, ends, typicalCycle, margin);
  const phase: CyclePhase =
    endUncertain || stale || (unreliable && estimatedPhase !== 'MENSTRUAL')
      ? 'UNKNOWN'
      : estimatedPhase;

  return {
    periods: periodsOut,
    current: open ? (periodsOut.find((p) => p.id === String(open._id)) ?? null) : null,
    currentEnd,
    autoEnded: !!currentEnd && today > currentEnd,
    averageCycleLength: typicalCycle,
    averagePeriodLength: typicalPeriod,
    cycleVariation: variation,
    cyclesUsed: usable.length,
    cycleDay: latest ? daysBetween(latest.start, today) + 1 : null,
    phase,
    estimatesStale: stale,
    nextPeriodStart: next?.start ?? null,
    nextPeriodInDays: next ? daysBetween(today, next.start) : null,
    ovulationDay: upcoming?.ovulationDay ?? null,
    fertileStart: upcoming?.fertileStart ?? null,
    fertileEnd: upcoming?.fertileEnd ?? null,
    predictions,
    notes,
    patterns,
    today: todayLog ? toDayOut(todayLog) : null,
  };
};
