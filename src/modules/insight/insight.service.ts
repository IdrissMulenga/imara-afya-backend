import type { IUser } from '../user/index.js';
import { HabitLog } from '../habit/index.js';
import { CheckIn } from '../checkin/index.js';
import { addDays, dayInZone } from '../../shared/datetime.js';
import { countOr, mean, roundTo } from '../../shared/numbers.js';
import type {
  Goals,
  HabitValues,
  InsightFactor,
  InsightOutcome,
  InsightPattern,
  InsightPeriod,
  Insights,
  MoodValues,
} from './insight.types.js';

const WEEK_DAYS = 7;
const PATTERN_DEFAULT_DAYS = 30;
const PATTERN_MAX_DAYS = 90;
//Fewest days on each side of a goal before a pattern is reported.
const MIN_DAYS_PER_SIDE = 5;
//Smallest gap in average mood or energy (1-5 scale) worth reporting.
const MIN_DIFFERENCE = 0.5;
//Smallest Welch t-statistic (about 95% confidence) for a gap to count as more than day-to-day noise.
const MIN_T_STATISTIC = 2;
//Fewest days on each side within one group of another habit when that habit is held fixed.
const MIN_DAYS_PER_GROUP = 2;
//Most check-ins one user can log in a day.
const CHECKINS_PER_DAY = 10;

//A recorded value, or null for a missing one or 0: a band sync leaves water at 0 on days it was
//never logged, and a band that was not worn reports 0 steps and 0 sleep.
const recorded = (value: number | null): number | null =>
  value != null && Number.isFinite(value) && value > 0 ? value : null;

const FACTORS: Record<
  InsightFactor,
  { value: (day: HabitValues) => number | null; goal: (goals: Goals) => number }
> = {
  SLEEP: { value: (day) => recorded(day.sleepHours), goal: (goals) => goals.sleep },
  STEPS: { value: (day) => recorded(day.steps), goal: (goals) => goals.steps },
  WATER: { value: (day) => recorded(day.waterGlasses), goal: (goals) => goals.water },
};

const OUTCOMES: Record<InsightOutcome, (day: MoodValues) => number> = {
  MOOD: (day) => day.mood,
  ENERGY: (day) => day.energy,
};

const averageOrNull = (values: number[], places: number): number | null =>
  values.length ? roundTo(mean(values), places) : null;

const inWindow = <T extends { day: string }>(rows: T[], start: string, end: string): T[] =>
  rows.filter((row) => row.day >= start && row.day <= end);

//Groups check-ins into one row per day holding that day's average mood and energy.
export const dailyMoods = (logs: MoodValues[]): MoodValues[] => {
  const days = new Map<string, MoodValues[]>();
  for (const log of logs) {
    const list = days.get(log.day) ?? [];
    list.push(log);
    days.set(log.day, list);
  }
  return [...days.entries()].map(([day, entries]) => ({
    day,
    mood: mean(entries.map((entry) => entry.mood)),
    energy: mean(entries.map((entry) => entry.energy)),
  }));
};

//Averages and goal-met days from start to end inclusive.
export const summarizePeriod = (
  habits: HabitValues[],
  moods: MoodValues[],
  goals: Goals,
  start: string,
  end: string
): InsightPeriod => {
  const habitDays = inWindow(habits, start, end);
  const moodDays = inWindow(moods, start, end);

  const values = (factor: InsightFactor): number[] =>
    habitDays.map(FACTORS[factor].value).filter((value): value is number => value != null);
  const goalDays = (factor: InsightFactor): number =>
    values(factor).filter((value) => value >= FACTORS[factor].goal(goals)).length;

  return {
    start,
    end,
    waterGlasses: averageOrNull(values('WATER'), 1),
    steps: averageOrNull(values('STEPS'), 0),
    sleepHours: averageOrNull(values('SLEEP'), 1),
    mood: averageOrNull(
      moodDays.map((day) => day.mood),
      1
    ),
    energy: averageOrNull(
      moodDays.map((day) => day.energy),
      1
    ),
    waterGoalDays: goalDays('WATER'),
    stepGoalDays: goalDays('STEPS'),
    sleepGoalDays: goalDays('SLEEP'),
    checkInDays: moodDays.length,
  };
};

//One day's mood or energy score, and whether a factor's goal was met that day.
export interface Sample {
  day: string;
  met: boolean;
  score: number;
}

//Sample variance (n - 1).
const variance = (values: number[]): number => {
  const average = mean(values);
  return values.reduce((total, value) => total + (value - average) ** 2, 0) / (values.length - 1);
};

//Welch's t-statistic for the gap between two groups' means; Infinity when neither group varies.
export const welchT = (a: number[], b: number[]): number => {
  const gap = Math.abs(mean(a) - mean(b));
  const error = Math.sqrt(variance(a) / a.length + variance(b) / b.length);
  if (error > 0) return gap / error;
  return gap > 0 ? Infinity : 0;
};

const scores = (samples: Sample[], met: boolean): number[] =>
  samples.filter((sample) => sample.met === met).map((sample) => sample.score);

//The candidate's gap measured separately on days the other factor's goal was met and on days it
//was missed, then combined by size. Null when no group has enough days on both sides.
export const heldFixedGap = (candidate: Sample[], other: Sample[]): number | null => {
  const otherMet = new Map(other.map((sample) => [sample.day, sample.met]));
  let weighted = 0;
  let weight = 0;

  for (const side of [true, false]) {
    const group = candidate.filter((sample) => otherMet.get(sample.day) === side);
    const met = scores(group, true);
    const missed = scores(group, false);
    if (met.length < MIN_DAYS_PER_GROUP || missed.length < MIN_DAYS_PER_GROUP) continue;

    const size = (met.length * missed.length) / (met.length + missed.length);
    weighted += size * (mean(met) - mean(missed));
    weight += size;
  }

  return weight > 0 ? weighted / weight : null;
};

//True when the candidate's gap shrinks below MIN_DIFFERENCE or flips once the stronger pattern's
//factor is held fixed, or when the two share enough days but never separate. Too few shared days
//to compare leaves the candidate standing.
export const explainedBy = (candidate: Sample[], gap: number, stronger: Sample[]): boolean => {
  const fixed = heldFixedGap(candidate, stronger);
  if (fixed === null) {
    const strongerDays = new Set(stronger.map((sample) => sample.day));
    const shared = candidate.filter((sample) => strongerDays.has(sample.day)).length;
    return shared >= 2 * MIN_DAYS_PER_SIDE;
  }
  return Math.sign(fixed) !== Math.sign(gap) || Math.abs(fixed) < MIN_DIFFERENCE;
};

//Mood and energy on goal-met versus goal-missed days, for each factor, largest gap first. A gap
//is reported only with enough days, a gap well above day-to-day noise, and when it survives
//holding each stronger pattern's factor fixed.
export const findPatterns = (
  habits: HabitValues[],
  moods: MoodValues[],
  goals: Goals
): InsightPattern[] => {
  const habitByDay = new Map(habits.map((habit) => [habit.day, habit]));
  const candidates: { pattern: InsightPattern; samples: Sample[]; gap: number }[] = [];

  for (const factor of Object.keys(FACTORS) as InsightFactor[]) {
    const goal = FACTORS[factor].goal(goals);

    for (const outcome of Object.keys(OUTCOMES) as InsightOutcome[]) {
      const samples: Sample[] = [];
      for (const mood of moods) {
        const habit = habitByDay.get(mood.day);
        const value = habit ? FACTORS[factor].value(habit) : null;
        if (value == null) continue;
        samples.push({ day: mood.day, met: value >= goal, score: OUTCOMES[outcome](mood) });
      }

      const met = scores(samples, true);
      const missed = scores(samples, false);
      if (met.length < MIN_DAYS_PER_SIDE || missed.length < MIN_DAYS_PER_SIDE) continue;

      const gap = mean(met) - mean(missed);
      if (Math.abs(gap) < MIN_DIFFERENCE || welchT(met, missed) < MIN_T_STATISTIC) continue;

      const goalMetAverage = roundTo(mean(met), 1);
      const goalMissedAverage = roundTo(mean(missed), 1);
      candidates.push({
        samples,
        gap,
        pattern: {
          factor,
          outcome,
          goalMetAverage,
          goalMissedAverage,
          goalMetDays: met.length,
          goalMissedDays: missed.length,
          difference: roundTo(goalMetAverage - goalMissedAverage, 1),
        },
      });
    }
  }

  candidates.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));

  const kept: typeof candidates = [];
  for (const candidate of candidates) {
    const explained = kept.some(
      (stronger) =>
        stronger.pattern.outcome === candidate.pattern.outcome &&
        explainedBy(candidate.samples, candidate.gap, stronger.samples)
    );
    if (!explained) kept.push(candidate);
  }

  return kept.map((candidate) => candidate.pattern);
};

//This week and last week side by side, and patterns over the last `days` days ending today.
export const buildInsights = (
  habits: HabitValues[],
  moods: MoodValues[],
  goals: Goals,
  today: string,
  days: number
): Insights => {
  const weekStart = addDays(today, -(WEEK_DAYS - 1));
  const lastWeekEnd = addDays(weekStart, -1);
  const lastWeekStart = addDays(lastWeekEnd, -(WEEK_DAYS - 1));
  const patternStart = addDays(today, -(days - 1));

  return {
    days,
    thisWeek: summarizePeriod(habits, moods, goals, weekStart, today),
    lastWeek: summarizePeriod(habits, moods, goals, lastWeekStart, lastWeekEnd),
    patterns: findPatterns(
      inWindow(habits, patternStart, today),
      inWindow(moods, patternStart, today),
      goals
    ),
  };
};

//Weekly comparison and habit-mood patterns from the user's logged days.
export const getInsights = async (user: IUser, days?: number | null): Promise<Insights> => {
  const count = countOr(days, PATTERN_DEFAULT_DAYS, PATTERN_MAX_DAYS);
  const today = dayInZone(new Date(), user.timezone);
  const span = Math.max(count, 2 * WEEK_DAYS);
  const oldest = addDays(today, -(span - 1));
  const range = { $gte: oldest, $lte: today };

  const [habits, checkIns] = await Promise.all([
    HabitLog.find({ user: user._id, day: range })
      .select('day waterGlasses steps sleepHours')
      .sort({ day: -1 })
      .limit(span)
      .lean<HabitValues[]>(),
    CheckIn.find({ user: user._id, day: range })
      .select('day mood energy')
      .sort({ day: -1 })
      .limit(span * CHECKINS_PER_DAY)
      .lean<MoodValues[]>(),
  ]);

  const goals: Goals = {
    water: user.waterGoalGlasses,
    steps: user.stepGoal,
    sleep: user.sleepGoalHours,
  };

  return buildInsights(habits, dailyMoods(checkIns), goals, today, count);
};
