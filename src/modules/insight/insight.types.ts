//REGULAR_SLEEP is met on a night within an hour of the usual (median) sleep.
export type InsightFactor = 'SLEEP' | 'STEPS' | 'WATER' | 'REGULAR_SLEEP';
export type SleepRegularity = 'STEADY' | 'VARIES' | 'IRREGULAR' | 'UNKNOWN';
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

//How long and how regularly the user sleeps, over recent nights.
export interface SleepSummary {
  //Nights with sleep recorded in the last 14.
  nights: number;
  //The median night over those nights; null without any.
  usualHours: number | null;
  //Standard deviation of those nights; null with fewer than 5.
  variationHours: number | null;
  regularity: SleepRegularity;
  goalHours: number;
  //Nights with sleep recorded in the last 7 days.
  weekNights: number;
  //Hours short of the goal over the nights recorded in the last 7 days.
  debtHours: number;
}

export interface Insights {
  days: number;
  thisWeek: InsightPeriod;
  lastWeek: InsightPeriod;
  sleep: SleepSummary;
  patterns: InsightPattern[];
}
