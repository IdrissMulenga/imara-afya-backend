export const weightTypeDefs = /* GraphQL */ `
  "One day's weight. day is YYYY-MM-DD in the user's timezone."
  type WeightEntry {
    day: String!
    kg: Float!
    "From this weight and the current height; null without a height."
    bmi: Float
    "The smoothed weight on this day: each day moves it a tenth of the way toward that day's weight, which evens out day-to-day swings."
    trendKg: Float!
  }

  "The newest weight, the trend and its weekly change, and the distance from the trend to the goal."
  type WeightSummary {
    "The newest logged weight, however old (see its day); null before the first."
    latest: WeightEntry
    "The trend at the newest weight; null when no weight is from the last three months or so."
    trendKg: Float
    "Change per week, from a straight line through the weights of the last 28 days; null with fewer than 3 weights or a span under 7 days."
    weeklyChangeKg: Float
    "The profile's weightGoalKg."
    goalKg: Float
    "goalKg minus trendKg: negative to lose, positive to gain; null without both."
    toGoalKg: Float
  }

  "Sets a day's weight (20-400 kg); day defaults to today (max 365 days back). The newest day becomes the profile weight."
  input LogWeightInput {
    day: String
    kg: Float!
  }

  extend type Query {
    "Logged weights in the last N days (default 90, max 365), newest first. Days without a weight are left out."
    weightHistory(days: Int): [WeightEntry!]!
    weightSummary: WeightSummary!
  }

  extend type Mutation {
    logWeight(input: LogWeightInput!): WeightEntry!
    "Removes one day's weight. false if there was none."
    deleteWeight(day: String!): Boolean!
  }
`;
