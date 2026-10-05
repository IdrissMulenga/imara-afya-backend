//Sets water for the day. Steps and sleep are device-managed and cannot be set here.
export interface LogHabitsInput {
  day?: string | null;
  waterGlasses?: number | null;
}

//Adds (or, with a negative number, removes) glasses. day defaults to today.
export interface AddWaterInput {
  day?: string | null;
  glasses: number;
}

import type { DataSource } from './habit.model.js';

//One day of totals from a device; null or missing leaves the stored value unchanged. Each value
//names its source (PHONE when missing), and replaces the stored one only if that source ranks at
//least as high: steps BAND > PHONE; sleep MANUAL > BAND > PHONE > ESTIMATE.
export interface DeviceDayInput {
  day: string;
  steps?: number | null;
  stepsSource?: DataSource | null;
  sleepHours?: number | null;
  sleepSource?: DataSource | null;
}

//How many band days were written, and how many were outside the window and ignored.
export interface DeviceSyncResult {
  syncedDays: number;
  skippedDays: number;
}

export interface HabitDay {
  day: string;
  waterGlasses: number;
  steps: number | null;
  sleepHours: number | null;
  stepsSource: DataSource | null;
  sleepSource: DataSource | null;
  //True when sleepHours is an estimate from the sleep schedule.
  sleepEstimated: boolean;
}

export interface HabitStreaks {
  water: number;
  steps: number;
  sleep: number;
}

export interface HabitSummary {
  today: HabitDay;
  streaks: HabitStreaks;
}
