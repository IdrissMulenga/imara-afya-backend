export const checkInTypeDefs = /* GraphQL */ `
  "One day's check-in. day is YYYY-MM-DD in the user's timezone."
  type CheckIn {
    day: String!
    "1 (very low) to 5 (very good)."
    mood: Int!
    "1 (exhausted) to 5 (full of energy)."
    energy: Int!
    note: String!
  }

  "Averages over the check-ins logged in the last N days. mood and energy are null when count is 0."
  type CheckInAverages {
    days: Int!
    count: Int!
    mood: Float
    energy: Float
  }

  type CheckInSummary {
    "null until today's check-in is logged."
    today: CheckIn
    "Consecutive days, ending today (or yesterday), with a check-in."
    streak: Int!
    week: CheckInAverages!
    month: CheckInAverages!
  }

  "Creates or replaces a day's check-in. day defaults to today (max 30 days back); an omitted note is unchanged."
  input LogCheckInInput {
    day: String
    mood: Int!
    energy: Int!
    note: String
  }

  extend type Query {
    checkInSummary: CheckInSummary!
    "Check-ins from the last N days (default 30, max 90), newest first. Days without one are omitted."
    checkInHistory(days: Int): [CheckIn!]!
  }

  extend type Mutation {
    logCheckIn(input: LogCheckInInput!): CheckIn!
    "Removes a day's check-in (default today). false if there was none."
    deleteCheckIn(day: String): Boolean!
  }
`;
