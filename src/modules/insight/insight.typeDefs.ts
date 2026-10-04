export const insightTypeDefs = /* GraphQL */ `
  enum InsightFactor {
    SLEEP
    STEPS
    WATER
    "A night within an hour of the usual (median) sleep over the pattern days, rather than a goal."
    REGULAR_SLEEP
  }

  "How regular nightly sleep is, from the spread of the last 14 nights: STEADY up to 0.75 h, VARIES up to 1.5 h, IRREGULAR above; UNKNOWN with fewer than 5 nights."
  enum SleepRegularity {
    STEADY
    VARIES
    IRREGULAR
    UNKNOWN
  }

  "Recent sleep: the usual night, how much it varies, and the hours short of the goal this week. Bedtimes are not recorded, so regularity is about how long, not when."
  type SleepSummary {
    "Nights with sleep recorded in the last 14."
    nights: Int!
    "The median night over those nights; null without any."
    usualHours: Float
    "Standard deviation of those nights in hours; null with fewer than 5."
    variationHours: Float
    regularity: SleepRegularity!
    goalHours: Float!
    "Nights with sleep recorded in the last 7 days."
    weekNights: Int!
    "Hours short of the goal over the nights recorded in the last 7 days."
    debtHours: Float!
  }

  enum InsightOutcome {
    MOOD
    ENERGY
  }

  "Averages and goal-met days over seven days (start..end, YYYY-MM-DD). An average is null when nothing was logged; a 0 counts as not logged (no water entered, or the band not worn)."
  type InsightPeriod {
    start: String!
    end: String!
    waterGlasses: Float
    steps: Int
    sleepHours: Float
    "Average of the daily average mood (1-5)."
    mood: Float
    "Average of the daily average energy (1-5)."
    energy: Float
    waterGoalDays: Int!
    stepGoalDays: Int!
    sleepGoalDays: Int!
    "Days with at least one check-in."
    checkInDays: Int!
  }

  "Average mood or energy on days the factor's goal was met versus missed. Shows a pattern in the user's own logs, not a cause."
  type InsightPattern {
    factor: InsightFactor!
    outcome: InsightOutcome!
    goalMetAverage: Float!
    goalMissedAverage: Float!
    goalMetDays: Int!
    goalMissedDays: Int!
    "goalMetAverage minus goalMissedAverage; negative when missed days were better."
    difference: Float!
  }

  type Insights {
    "Days the patterns are drawn from."
    days: Int!
    "The last seven days, ending today."
    thisWeek: InsightPeriod!
    "The seven days before thisWeek."
    lastWeek: InsightPeriod!
    sleep: SleepSummary!
    "Largest gap first; empty until one qualifies. A pattern needs 5 or more days on each side, a gap of at least 0.5 that is well above day-to-day noise, and a gap that remains when a stronger pattern's habit is held fixed."
    patterns: [InsightPattern!]!
  }

  extend type Query {
    "This week against last week, and patterns over the last N days (default 30, max 90). Goals are the current profile goals."
    insights(days: Int): Insights!
  }
`;
