export type InsightFactor = 'SLEEP' | 'STEPS' | 'WATER';
export type InsightOutcome = 'MOOD' | 'ENERGY';

//One day's habit values; steps and sleepHours are null until the band syncs them.
export interface HabitValues {
  day: string;
  waterGlasses: number;
  steps: number | null;
  sleepHours: number | null;
}

//One day's average mood and energy across its check-ins.
export interface MoodValues {
  day: string;
  mood: number;
  energy: number;
}

export interface Goals {
  water: number;
  steps: number;
  sleep: number;
}

//Averages and goal counts over one 7-day period; an average is null when nothing was logged.
export interface InsightPeriod {
  start: string;
  end: string;
  waterGlasses: number | null;
  steps: number | null;
  sleepHours: number | null;
  mood: number | null;
  energy: number | null;
  waterGoalDays: number;
  stepGoalDays: number;
  sleepGoalDays: number;
  checkInDays: number;
}

//Average mood or energy on days a goal was met versus missed.
export interface InsightPattern {
  factor: InsightFactor;
  outcome: InsightOutcome;
  goalMetAverage: number;
  goalMissedAverage: number;
  goalMetDays: number;
  goalMissedDays: number;
  //goalMetAverage minus goalMissedAverage.
  difference: number;
}

export interface Insights {
  days: number;
  thisWeek: InsightPeriod;
  lastWeek: InsightPeriod;
  patterns: InsightPattern[];
}
