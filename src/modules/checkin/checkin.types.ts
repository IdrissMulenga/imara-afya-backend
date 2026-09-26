//Logs a new check-in now.
export interface LogCheckInInput {
  mood: number;
  energy: number;
  note?: string | null;
}

export interface CheckInEntry {
  id: string;
  day: string;
  //ISO timestamp.
  at: string;
  mood: number;
  energy: number;
  note: string;
}

//One day's check-ins with that day's average mood and energy.
export interface CheckInDay {
  day: string;
  mood: number;
  energy: number;
  entries: CheckInEntry[];
}

//Averages over the days checked in within a window; null when there are none.
export interface CheckInAverages {
  days: number;
  count: number;
  mood: number | null;
  energy: number | null;
}

export interface CheckInSummary {
  today: CheckInEntry[];
  latest: CheckInEntry | null;
  streak: number;
  week: CheckInAverages;
  month: CheckInAverages;
}
