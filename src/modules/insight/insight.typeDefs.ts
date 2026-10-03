export const insightTypeDefs = /* GraphQL */ `
  enum InsightFactor {
    SLEEP
    STEPS
    WATER
  }

  enum InsightOutcome {
    MOOD
    ENERGY
  }

  "Averages and goal-met days over seven days (start..end, YYYY-MM-DD). An average is null when nothing was logged; water counts only days with at least one glass."
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
    "Largest gap first; empty until one qualifies. A pattern needs 5 or more days on each side, a gap of at least 0.5 that is well above day-to-day noise, and a gap that remains when a stronger pattern's habit is held fixed."
    patterns: [InsightPattern!]!
  }

  extend type Query {
    "This week against last week, and patterns over the last N days (default 30, max 90). Goals are the current profile goals."
    insights(days: Int): Insights!
  }
`;
