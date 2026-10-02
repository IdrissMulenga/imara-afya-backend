export const habitTypeDefs = /* GraphQL */ `
  "One day of water, steps and sleep. day is YYYY-MM-DD in the user's timezone."
  type HabitDay {
    day: String!
    waterGlasses: Float!
    "Steps synced from the paired band (syncBand); null means not yet synced."
    steps: Int
    "Sleep that ended on this day, synced from the paired band (syncBand); null means not yet synced."
    sleepHours: Float
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

  "Sets only the manual water value for the day. Steps and sleep are device-managed and are not writable here."
  input LogHabitsInput {
    day: String
    waterGlasses: Float
  }

  "Adds glasses of water (negative removes). day defaults to today."
  input AddWaterInput {
    day: String
    glasses: Float!
  }

  extend type Query {
    habitSummary: HabitSummary!
    "The last N days (default 7, max 90), newest first. Missing device values are returned as null, not zero."
    habitHistory(days: Int): [HabitDay!]!
  }

  extend type Mutation {
    logHabits(input: LogHabitsInput!): HabitDay!
    addWater(input: AddWaterInput!): HabitDay!
  }
`;
