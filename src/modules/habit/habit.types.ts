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

//One day of totals from the paired band; null or missing leaves the stored value unchanged.
export interface DeviceDayInput {
  day: string;
  steps?: number | null;
  sleepHours?: number | null;
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
