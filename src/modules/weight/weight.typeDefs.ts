export const weightTypeDefs = /* GraphQL */ `
  "One day's weight. day is YYYY-MM-DD in the user's timezone."
  type WeightEntry {
    day: String!
    kg: Float!
    "From this weight and the current height; null without a height."
    bmi: Float
  }

  "Sets a day's weight (20-400 kg); day defaults to today (max 365 days back). The newest day becomes the profile weight."
  input LogWeightInput {
    day: String
    kg: Float!
  }

  extend type Query {
    "Logged weights in the last N days (default 90, max 365), newest first. Days without a weight are left out."
    weightHistory(days: Int): [WeightEntry!]!
  }

  extend type Mutation {
    logWeight(input: LogWeightInput!): WeightEntry!
    "Removes one day's weight. false if there was none."
    deleteWeight(day: String!): Boolean!
  }
`;
