import type { GlucoseContext, VitalKind } from './vital.model.js';

export type { GlucoseContext, VitalKind };

export type VitalCategory =
  | 'VERY_LOW'
  | 'LOW'
  | 'NORMAL'
  | 'HIGH_NORMAL'
  | 'RAISED'
  | 'HIGH'
  | 'HIGH_GRADE_1'
  | 'HIGH_GRADE_2'
  | 'SEVERE'
  | 'VERY_HIGH';

//What to do about a reading, least to most serious.
export type VitalAdvice = 'NONE' | 'RECHECK' | 'SEE_HEALTH_WORKER' | 'URGENT';

export interface Assessment {
  category: VitalCategory;
  advice: VitalAdvice;
}

//Logs one reading. Blood pressure needs systolic and diastolic (pulse optional); glucose needs
//glucoseMmol and glucoseContext; pulse needs pulse. `at` defaults to now.
export interface LogVitalInput {
  kind: VitalKind;
  systolic?: number | null;
  diastolic?: number | null;
  pulse?: number | null;
  glucoseMmol?: number | null;
  glucoseContext?: GlucoseContext | null;
  note?: string | null;
  at?: string | null;
  //An id the app makes for this reading; sending it again returns the reading already saved.
  clientId?: string | null;
}

export interface VitalEntry {
  id: string;
  kind: VitalKind;
  day: string;
  at: string;
  systolic: number | null;
  diastolic: number | null;
  pulse: number | null;
  glucoseMmol: number | null;
  glucoseContext: GlucoseContext | null;
  note: string;
  //For the reading's main measure.
  category: VitalCategory;
  //For the pulse given with a blood pressure reading, or a pulse reading; null without a pulse.
  pulseCategory: VitalCategory | null;
  //The most serious advice across the reading's measures.
  advice: VitalAdvice;
}

//Average blood pressure over recent readings, with how it is classed.
export interface PressureAverage {
  days: number;
  readings: number;
  systolic: number | null;
  diastolic: number | null;
  category: VitalCategory | null;
}

export interface VitalSummary {
  latestPressure: VitalEntry | null;
  latestGlucose: VitalEntry | null;
  //The newest reading that has a pulse (a pulse reading or a blood pressure reading with one).
  latestPulse: VitalEntry | null;
  pressureWeek: PressureAverage;
  pressureMonth: PressureAverage;
}
