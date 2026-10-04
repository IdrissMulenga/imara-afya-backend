export type StreakMetric = 'WATER' | 'STEPS' | 'SLEEP' | 'CHECKIN';
export type BadgeKind = 'FIRST_CHECKIN' | 'FIRST_WEEK' | 'STREAK' | 'WEIGHT_GOAL';

//One badge: earned once progress reaches the target.
export interface Badge {
  //Stable id for the app, e.g. WATER_30.
  id: string;
  kind: BadgeKind;
  //The habit a STREAK badge counts; null for the others.
  metric: StreakMetric | null;
  target: number;
  //Toward the target, never above it.
  progress: number;
  earned: boolean;
  //The day it was first earned (YYYY-MM-DD); null while not earned or when unknown.
  earnedOn: string | null;
}

//The highest value logged on one day.
export interface PersonalBest {
  value: number;
  day: string;
}

//The longest run of consecutive days, ever, for each habit.
export interface LongestStreaks {
  water: number;
  steps: number;
  sleep: number;
  checkIn: number;
}

export interface Achievements {
  earnedCount: number;
  badges: Badge[];
  mostSteps: PersonalBest | null;
  mostWater: PersonalBest | null;
  longestSleep: PersonalBest | null;
  longestStreaks: LongestStreaks;
}

//One day of habits, as stored.
export interface HabitDay {
  day: string;
  waterGlasses: number;
  steps: number | null;
  sleepHours: number | null;
}

export interface AchievementGoals {
  water: number;
  steps: number;
  sleep: number;
  //The profile weight and goal, for the weight goal badge.
  weightKg: number | null;
  weightGoalKg: number | null;
}
