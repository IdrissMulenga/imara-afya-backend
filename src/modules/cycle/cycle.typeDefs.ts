export const cycleTypeDefs = /* GraphQL */ `
  "A period. Dates are YYYY-MM-DD in the user's timezone; end is null while it is open."
  type CyclePeriod {
    id: ID!
    start: String!
    end: String
    "Days from start to end inclusive; null while open."
    lengthDays: Int
    "Days from this start to the next period's start; null for the latest."
    cycleLength: Int
  }

  enum CyclePhase {
    MENSTRUAL
    FOLLICULAR
    FERTILE
    LUTEAL
    UNKNOWN
  }

  enum CycleFlow {
    NONE
    SPOTTING
    LIGHT
    MEDIUM
    HEAVY
  }

  enum CycleSymptom {
    CRAMPS
    HEADACHE
    BACK_PAIN
    BLOATING
    TENDER_BREASTS
    ACNE
    FATIGUE
    NAUSEA
    CRAVINGS
    INSOMNIA
    MOOD_SWINGS
    ANXIETY
  }

  enum CycleDischarge {
    DRY
    STICKY
    CREAMY
    WATERY
    EGG_WHITE
    UNUSUAL
  }

  "Patterns outside the usual ranges (cycles of 24-38 days varying by up to 9, periods up to 8 days), or a period a week or more late."
  enum CycleNote {
    IRREGULAR
    SHORT_CYCLES
    LONG_CYCLES
    LONG_PERIODS
    VERY_LATE
  }

  "What was noted on one day."
  type CycleDay {
    day: String!
    flow: CycleFlow!
    symptoms: [CycleSymptom!]!
    discharge: CycleDischarge
    note: String!
  }

  "An expected period with its fertile window; earliest..latest is the likely range for the start."
  type CyclePrediction {
    start: String!
    end: String!
    earliest: String!
    latest: String!
    ovulationDay: String!
    fertileStart: String!
    fertileEnd: String!
  }

  "A symptom and the phase it is most often logged in; share is 0 to 1."
  type SymptomPattern {
    symptom: CycleSymptom!
    phase: CyclePhase!
    count: Int!
    share: Float!
  }

  "Recent periods and what they predict. Predictions are estimates, not medical advice or contraception."
  type CycleSummary {
    "Newest first, up to 24."
    periods: [CyclePeriod!]!
    "The open period, if any."
    current: CyclePeriod
    "The day the open period is taken to end: its typical length, longer while flow is logged."
    currentEnd: String
    "True once the open period has passed currentEnd."
    autoEnded: Boolean!
    "Median of the recent cycles (28 until there are any)."
    averageCycleLength: Int!
    "Median of the recent periods (5 until there are any)."
    averagePeriodLength: Int!
    "Longest minus shortest recent cycle; null with fewer than two."
    cycleVariation: Int
    "Cycles the typical lengths come from."
    cyclesUsed: Int!
    "Day of the current cycle, counting the latest period start as day 1."
    cycleDay: Int
    phase: CyclePhase!
    nextPeriodStart: String
    "Negative when the period is late."
    nextPeriodInDays: Int
    ovulationDay: String
    fertileStart: String
    fertileEnd: String
    "The next three expected periods."
    predictions: [CyclePrediction!]!
    notes: [CycleNote!]!
    "Up to four symptoms logged at least three times, with their most common phase."
    patterns: [SymptomPattern!]!
    today: CycleDay
  }

  "Sets one day's log; day defaults to today (max 90 days back). An empty log removes it."
  input CycleDayInput {
    day: String
    flow: CycleFlow
    symptoms: [CycleSymptom!]
    discharge: CycleDischarge
    note: String
  }

  extend type Query {
    cycleSummary: CycleSummary!
    "Day logs from..to (YYYY-MM-DD, inclusive), newest first; at most 400 days."
    cycleDays(from: String!, to: String!): [CycleDay!]!
  }

  extend type Mutation {
    "Starts a period on day (default today, max 90 days back). An open period past its typical length is closed first."
    startPeriod(day: String): CyclePeriod!
    "Ends the open period on day (default today)."
    endPeriod(day: String): CyclePeriod!
    "Removes a logged period. false if there was none."
    deletePeriod(id: ID!): Boolean!
    "Returns the saved day, or null when the log was emptied and removed."
    logCycleDay(input: CycleDayInput!): CycleDay
  }
`;
