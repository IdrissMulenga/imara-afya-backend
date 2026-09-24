export const habitTypeDefs = /* GraphQL */ `
  "One day of water, steps and sleep. day is YYYY-MM-DD in the user's timezone."
  type HabitDay {
    day: String!
    waterGlasses: Float!
    steps: Int!
    "Sleep that ended on this day."
    sleepHours: Float!
  }

  "Consecutive days, ending today (or yesterday), on which each goal was met."
  type HabitStreaks {
    water: Int!
    steps: Int!
    sleep: Int!
  }

  type HabitSummary {
    today: HabitDay!
    streaks: HabitStreaks!
  }

  "Sets absolute values. Omitted fields are unchanged; day defaults to today (max 30 days back)."
  input LogHabitsInput {
    day: String
    waterGlasses: Float
    steps: Int
    sleepHours: Float
  }

  "Adds glasses of water (negative removes). day defaults to today."
  input AddWaterInput {
    day: String
    glasses: Float!
  }

  extend type Query {
    habitSummary: HabitSummary!
    "The last N days (default 7, max 90), newest first, empty days as zeros."
    habitHistory(days: Int): [HabitDay!]!
  }

  extend type Mutation {
    logHabits(input: LogHabitsInput!): HabitDay!
    addWater(input: AddWaterInput!): HabitDay!
  }
`;
