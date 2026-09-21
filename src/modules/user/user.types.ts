//WHAT THE APP SENDS TO THE USER MODULE.
//
//Every field optional: these are patches. A field the app did not send must be
//left alone, not overwritten.

export interface UpdateProfileInput {
  name?: string;
  photoUrl?: string;
  gender?: 'female' | 'male' | 'unspecified';
  birthDate?: string;
  heightCm?: number;
  weightKg?: number;
}

export interface PreferencesInput {
  language?: 'en' | 'fr' | 'sw' | 'rn';
  units?: 'metric' | 'imperial';
  timezone?: string;
  cycleTrackingEnabled?: boolean;
  waterGoalGlasses?: number;
  stepGoal?: number;
  sleepGoalHours?: number;
}
