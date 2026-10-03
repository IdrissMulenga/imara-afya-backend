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
  //The smoothed weight on this day, which evens out day-to-day swings.
  trendKg: number;
}

//The newest weight, the trend and its weekly change, and how far the trend is from the goal.
export interface WeightSummary {
  latest: WeightEntry | null;
  trendKg: number | null;
  //Change per week from the weights of the last 28 days; null with too few weights.
  weeklyChangeKg: number | null;
  goalKg: number | null;
  //goalKg minus trendKg: negative to lose, positive to gain; null without both.
  toGoalKg: number | null;
}
