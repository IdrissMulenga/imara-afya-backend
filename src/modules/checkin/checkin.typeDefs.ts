export const checkInTypeDefs = /* GraphQL */ `
  "One check-in. day is YYYY-MM-DD in the user's timezone; at is when it was logged (ISO)."
  type CheckIn {
    id: ID!
    day: String!
    at: String!
    "1 (very low) to 5 (very good)."
    mood: Int!
    "1 (exhausted) to 5 (full of energy)."
    energy: Int!
    note: String!
  }

  "One day's check-ins, newest first, with that day's average mood and energy."
  type CheckInDay {
    day: String!
    mood: Float!
    energy: Float!
    entries: [CheckIn!]!
  }

  "Averages of the daily averages over the days checked in within the last N days. mood and energy are null when count is 0."
  type CheckInAverages {
    days: Int!
    count: Int!
    mood: Float
    energy: Float
  }

  type CheckInSummary {
    "Today's check-ins, newest first."
    today: [CheckIn!]!
    "The newest of today's check-ins, or null."
    latest: CheckIn
    "Consecutive days, ending today (or yesterday), with at least one check-in."
    streak: Int!
    week: CheckInAverages!
    month: CheckInAverages!
  }

  "Logs a new check-in now (up to 10 a day)."
  input LogCheckInInput {
    mood: Int!
    energy: Int!
    note: String
  }

  extend type Query {
    checkInSummary: CheckInSummary!
    "Days with check-ins in the last N days (default 30, max 90), newest first."
    checkInHistory(days: Int): [CheckInDay!]!
  }

  extend type Mutation {
    logCheckIn(input: LogCheckInInput!): CheckIn!
    "Removes one check-in from the last 30 days. false if there was none."
    deleteCheckIn(id: ID!): Boolean!
  }
`;
