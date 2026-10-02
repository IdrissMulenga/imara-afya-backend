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

  "Estimated cycle phase based on logged dates; not a biological measurement or contraception guidance."
  enum CyclePhase {
    MENSTRUAL
    FOLLICULAR
    "An estimated fertile phase; this estimate is not contraception and must not be used to prevent pregnancy."
    FERTILE
    LUTEAL
    "The phase is unknown: an open period's end is unconfirmed, the next period is overdue, bleeding was prolonged, or estimates are stale."
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

  "Patterns outside the usual ranges (cycles of 24-38 days varying by up to 9, periods up to 8 days), prolonged bleeding, or a period a week or more late."
  enum CycleNote {
    IRREGULAR
    SHORT_CYCLES
    LONG_CYCLES
    "A recent period, or the current bleeding, lasted more than 8 days."
    LONG_PERIODS
    "Bleeding lasted more than 15 days. The app should advise seeing a health worker (risk of anaemia)."
    PROLONGED_BLEEDING
    "The next period is a week or more overdue, counted from when it was expected (after bleeding stopped, if it ran long). The app should suggest a pregnancy test or a health worker."
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

  "Estimated period dates and fertile window; not reliable contraception and must not be used to prevent pregnancy."
  type CyclePrediction {
    "Estimated period start; cycle estimates must not be used to prevent pregnancy."
    start: String!
    "Estimated period end; cycle estimates must not be used to prevent pregnancy."
    end: String!
    "Earliest estimated period start; cycle estimates must not be used to prevent pregnancy."
    earliest: String!
    "Latest estimated period start; cycle estimates must not be used to prevent pregnancy."
    latest: String!
    "Estimated ovulation day; this estimate must not be used to prevent pregnancy."
    ovulationDay: String!
    "Estimated beginning of the fertile window; this estimate must not be used to prevent pregnancy."
    fertileStart: String!
    "Estimated end of the fertile window; this estimate must not be used to prevent pregnancy."
    fertileEnd: String!
  }

  "A symptom and its estimated phase association from logged cycle dates; share is 0 to 1."
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
    "The inferred end of the open period; null if continuation is truncated or its past end lacks a following nonbleeding day log."
    currentEnd: String
    "True once the open period has passed a confirmed currentEnd; false when its end is unknown."
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
    "True when the latest period started over two typical cycles ago and nothing was logged in the last 30 days. Predictions and the fertile window are then empty and phase is UNKNOWN; VERY_LATE and cycleDay are still given. The app should ask whether a period has come since the latest start: if yes, log it; if no, show missed-period guidance (pregnancy test, see a health worker)."
    estimatesStale: Boolean!
    "Estimated next period start; cycle estimates must not be used to prevent pregnancy."
    nextPeriodStart: String
    "Estimated days until the next period; cycle estimates must not be used to prevent pregnancy. Negative when late."
    nextPeriodInDays: Int
    "Estimated ovulation day; null while VERY_LATE or PROLONGED_BLEEDING. This estimate must not be used to prevent pregnancy."
    ovulationDay: String
    "Estimated beginning of the fertile window; null while VERY_LATE or PROLONGED_BLEEDING. This estimate must not be used to prevent pregnancy."
    fertileStart: String
    "Estimated end of the fertile window; null while VERY_LATE or PROLONGED_BLEEDING. This estimate must not be used to prevent pregnancy."
    fertileEnd: String
    "The next three expected periods; only the first while VERY_LATE or PROLONGED_BLEEDING, none while estimatesStale."
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
    "Starts a period on day (default today, max 90 days back). An open period closes automatically only after a nonbleeding day confirms its inferred end; otherwise end it explicitly first."
    startPeriod(day: String): CyclePeriod!
    "Ends the open period on day (default today). Any length is accepted; periods over 8 days raise the LONG_PERIODS note."
    endPeriod(day: String): CyclePeriod!
    "Removes a logged period. false if there was none."
    deletePeriod(id: ID!): Boolean!
    "Returns the saved day, or null when the log was emptied and removed."
    logCycleDay(input: CycleDayInput!): CycleDay
  }
`;
