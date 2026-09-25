//Sets the day's check-in. An omitted note is left unchanged; day defaults to today.
export interface LogCheckInInput {
  day?: string | null;
  mood: number;
  energy: number;
  note?: string | null;
}

export interface CheckInDay {
  day: string;
  mood: number;
  energy: number;
  note: string;
}

//Averages over the check-ins logged in a window; null when there are none.
export interface CheckInAverages {
  days: number;
  count: number;
  mood: number | null;
  energy: number | null;
}

export interface CheckInSummary {
  today: CheckInDay | null;
  streak: number;
  week: CheckInAverages;
  month: CheckInAverages;
}
