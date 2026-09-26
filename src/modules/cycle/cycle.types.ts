export const FLOWS = ['NONE', 'SPOTTING', 'LIGHT', 'MEDIUM', 'HEAVY'] as const;
export const SYMPTOMS = [
  'CRAMPS',
  'HEADACHE',
  'BACK_PAIN',
  'BLOATING',
  'TENDER_BREASTS',
  'ACNE',
  'FATIGUE',
  'NAUSEA',
  'CRAVINGS',
  'INSOMNIA',
  'MOOD_SWINGS',
  'ANXIETY',
] as const;
export const DISCHARGES = ['DRY', 'STICKY', 'CREAMY', 'WATERY', 'EGG_WHITE', 'UNUSUAL'] as const;

export type Flow = (typeof FLOWS)[number];
export type Symptom = (typeof SYMPTOMS)[number];
export type Discharge = (typeof DISCHARGES)[number];
export type CyclePhase = 'MENSTRUAL' | 'FOLLICULAR' | 'FERTILE' | 'LUTEAL' | 'UNKNOWN';
export type CycleNote = 'IRREGULAR' | 'SHORT_CYCLES' | 'LONG_CYCLES' | 'LONG_PERIODS' | 'VERY_LATE';

//Sets one day's log. An empty log (no flow, symptoms, discharge or note) removes it.
export interface CycleDayInput {
  day?: string | null;
  flow?: Flow | null;
  symptoms?: Symptom[] | null;
  discharge?: Discharge | null;
  note?: string | null;
}

export interface CycleDayOut {
  day: string;
  flow: Flow;
  symptoms: Symptom[];
  discharge: Discharge | null;
  note: string;
}

export interface CyclePeriodOut {
  id: string;
  start: string;
  end: string | null;
  //Days from start to end inclusive; null while open.
  lengthDays: number | null;
  //Days from this start to the next period's start; null for the latest.
  cycleLength: number | null;
}

//One expected period with its fertile window; earliest..latest is the likely range.
export interface CyclePrediction {
  start: string;
  end: string;
  earliest: string;
  latest: string;
  ovulationDay: string;
  fertileStart: string;
  fertileEnd: string;
}

//A symptom and the phase it is most often logged in.
export interface SymptomPattern {
  symptom: Symptom;
  phase: CyclePhase;
  count: number;
  //Share of this symptom's logs that fall in that phase, 0 to 1.
  share: number;
}

//The recent periods and what they predict. Dates are YYYY-MM-DD in the user's timezone.
export interface CycleSummary {
  periods: CyclePeriodOut[];
  current: CyclePeriodOut | null;
  currentEnd: string | null;
  autoEnded: boolean;
  averageCycleLength: number;
  averagePeriodLength: number;
  cycleVariation: number | null;
  cyclesUsed: number;
  cycleDay: number | null;
  phase: CyclePhase;
  nextPeriodStart: string | null;
  nextPeriodInDays: number | null;
  ovulationDay: string | null;
  fertileStart: string | null;
  fertileEnd: string | null;
  predictions: CyclePrediction[];
  notes: CycleNote[];
  patterns: SymptomPattern[];
  today: CycleDayOut | null;
}
