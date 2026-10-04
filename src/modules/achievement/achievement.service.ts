import type { IUser } from '../user/index.js';
import { HabitLog } from '../habit/index.js';
import { CheckIn } from '../checkin/index.js';
import { addDays } from '../../shared/datetime.js';
import type {
  AchievementGoals,
  Achievements,
  Badge,
  HabitDay,
  PersonalBest,
  StreakMetric,
} from './achievement.types.js';

//Days of history read: ten years of daily logs.
const MAX_DAYS = 3_660;
//Days with something logged for the first-week badge.
const FIRST_WEEK_DAYS = 7;
//Closer to the weight goal than this counts as reached.
const WEIGHT_GOAL_RANGE_KG = 0.5;

//The streak badges, by habit, and the days each needs.
const STREAK_TARGETS: Record<StreakMetric, number[]> = {
  WATER: [7, 30, 100],
  STEPS: [7, 30, 100],
  SLEEP: [7, 30],
  CHECKIN: [7, 30, 100],
};

//The longest run of consecutive days in `days`, and the day each target length was first reached.
export const streakStats = (
  days: string[],
  targets: number[]
): { best: number; reachedOn: Map<number, string> } => {
  const sorted = [...new Set(days)].sort();
  const reachedOn = new Map<number, string>();
  let best = 0;
  let run = 0;
  sorted.forEach((day, i) => {
    run = i > 0 && addDays(sorted[i - 1], 1) === day ? run + 1 : 1;
    best = Math.max(best, run);
    for (const target of targets) {
      if (run === target && !reachedOn.has(target)) reachedOn.set(target, day);
    }
  });
  return { best, reachedOn };
};

//The day with the highest value, the earliest on a tie; null when nothing was logged.
export const personalBest = (
  habits: HabitDay[],
  pick: (day: HabitDay) => number | null
): PersonalBest | null => {
  let best: PersonalBest | null = null;
  for (const habit of [...habits].sort((a, b) => (a.day < b.day ? -1 : 1))) {
    const value = pick(habit);
    if (value != null && value > 0 && (!best || value > best.value))
      best = { value, day: habit.day };
  }
  return best;
};

//Every badge with its progress, and the personal bests, from the habit days and check-in days.
export const buildAchievements = (
  habits: HabitDay[],
  checkInDays: string[],
  goals: AchievementGoals
): Achievements => {
  const metDays: Record<StreakMetric, string[]> = {
    WATER: habits
      .filter((h) => h.waterGlasses > 0 && h.waterGlasses >= goals.water)
      .map((h) => h.day),
    STEPS: habits
      .filter((h) => h.steps != null && h.steps > 0 && h.steps >= goals.steps)
      .map((h) => h.day),
    SLEEP: habits
      .filter((h) => h.sleepHours != null && h.sleepHours > 0 && h.sleepHours >= goals.sleep)
      .map((h) => h.day),
    CHECKIN: checkInDays,
  };
  const stats = Object.fromEntries(
    (Object.keys(STREAK_TARGETS) as StreakMetric[]).map((metric) => [
      metric,
      streakStats(metDays[metric], STREAK_TARGETS[metric]),
    ])
  ) as Record<StreakMetric, ReturnType<typeof streakStats>>;

  const activeDays = [
    ...new Set([
      ...habits
        .filter((h) => h.waterGlasses > 0 || (h.steps ?? 0) > 0 || (h.sleepHours ?? 0) > 0)
        .map((h) => h.day),
      ...checkInDays,
    ]),
  ].sort();

  const badge = (
    id: string,
    kind: Badge['kind'],
    metric: StreakMetric | null,
    target: number,
    reached: number,
    earnedOn: string | null
  ): Badge => ({
    id,
    kind,
    metric,
    target,
    progress: Math.min(reached, target),
    earned: reached >= target,
    earnedOn: reached >= target ? earnedOn : null,
  });

  const sortedCheckIns = [...checkInDays].sort();
  const weightReached =
    goals.weightKg != null &&
    goals.weightGoalKg != null &&
    Math.abs(goals.weightKg - goals.weightGoalKg) <= WEIGHT_GOAL_RANGE_KG;

  const badges: Badge[] = [
    badge(
      'FIRST_CHECKIN',
      'FIRST_CHECKIN',
      null,
      1,
      sortedCheckIns.length ? 1 : 0,
      sortedCheckIns[0] ?? null
    ),
    badge(
      'FIRST_WEEK',
      'FIRST_WEEK',
      null,
      FIRST_WEEK_DAYS,
      activeDays.length,
      activeDays[FIRST_WEEK_DAYS - 1] ?? null
    ),
    ...(Object.keys(STREAK_TARGETS) as StreakMetric[]).flatMap((metric) =>
      STREAK_TARGETS[metric].map((target) =>
        badge(
          `${metric}_${target}`,
          'STREAK',
          metric,
          target,
          stats[metric].best,
          stats[metric].reachedOn.get(target) ?? null
        )
      )
    ),
    badge('WEIGHT_GOAL', 'WEIGHT_GOAL', null, 1, weightReached ? 1 : 0, null),
  ];

  return {
    earnedCount: badges.filter((b) => b.earned).length,
    badges,
    mostSteps: personalBest(habits, (h) => h.steps),
    mostWater: personalBest(habits, (h) => h.waterGlasses),
    longestSleep: personalBest(habits, (h) => h.sleepHours),
    longestStreaks: {
      water: stats.WATER.best,
      steps: stats.STEPS.best,
      sleep: stats.SLEEP.best,
      checkIn: stats.CHECKIN.best,
    },
  };
};

//Badges and personal bests from the user's whole history. Streaks are judged against the
//current goals.
export const getAchievements = async (user: IUser): Promise<Achievements> => {
  const [habits, checkInDays] = await Promise.all([
    HabitLog.find({ user: user._id })
      .select('day waterGlasses steps sleepHours')
      .sort({ day: -1 })
      .limit(MAX_DAYS)
      .lean<HabitDay[]>(),
    CheckIn.distinct('day', { user: user._id }) as Promise<string[]>,
  ]);

  return buildAchievements(habits, [...checkInDays].sort().slice(-MAX_DAYS), {
    water: user.waterGoalGlasses,
    steps: user.stepGoal,
    sleep: user.sleepGoalHours,
    weightKg: user.weightKg,
    weightGoalKg: user.weightGoalKg ?? null,
  });
};
