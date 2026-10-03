//Sets the weight for a day; day defaults to today.
export interface LogWeightInput {
  day?: string | null;
  kg: number;
}

export interface WeightEntry {
  day: string;
  kg: number;
  //From this weight and the current height; null without a height.
  bmi: number | null;
}
