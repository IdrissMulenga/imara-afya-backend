//Sets absolute values. Omitted fields are left unchanged; day defaults to today.
export interface LogHabitsInput {
  day?: string | null;
  waterGlasses?: number | null;
  steps?: number | null;
  sleepHours?: number | null;
}

//Adds (or, with a negative number, removes) glasses. day defaults to today.
export interface AddWaterInput {
  day?: string | null;
  glasses: number;
}

export interface HabitDay {
  day: string;
  waterGlasses: number;
  steps: number;
  sleepHours: number;
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
