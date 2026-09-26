//Omitted fields are left unchanged; null clears birthDate, heightCm or weightKg.
export interface UpdateProfileInput {
  name?: string;
  gender?: 'female' | 'male' | 'unspecified';
  birthDate?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
}

export interface PreferencesInput {
  language?: 'en' | 'fr' | 'sw' | 'rn';
  units?: 'metric' | 'imperial';
  timezone?: string;
  cycleTrackingEnabled?: boolean;
  waterGoalGlasses?: number;
  stepGoal?: number;
  sleepGoalHours?: number;
  sleepBedtime?: string | null;
  sleepWakeTime?: string | null;
  sleepWeekendBedtime?: string | null;
  sleepWeekendWakeTime?: string | null;
}
