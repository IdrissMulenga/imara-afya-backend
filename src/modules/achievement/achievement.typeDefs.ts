export const achievementTypeDefs = /* GraphQL */ `
  enum StreakMetric {
    WATER
    STEPS
    SLEEP
    CHECKIN
  }

  enum BadgeKind {
    "The first check-in."
    FIRST_CHECKIN
    "Something logged on 7 different days."
    FIRST_WEEK
    "A run of target days in a row meeting the metric's goal (CHECKIN: at least one check-in)."
    STREAK
    "The profile weight within 0.5 kg of the weight goal."
    WEIGHT_GOAL
  }

  "One badge, earned once progress reaches target."
  type Badge {
    "Stable id, e.g. WATER_30."
    id: ID!
    kind: BadgeKind!
    "The habit a STREAK badge counts; null for the others."
    metric: StreakMetric
    target: Int!
    "Toward the target, never above it."
    progress: Int!
    earned: Boolean!
    "The day it was first earned (YYYY-MM-DD); null while not earned, and for WEIGHT_GOAL."
    earnedOn: String
  }

  "The highest value logged on one day."
  type PersonalBest {
    value: Float!
    day: String!
  }

  "The longest run of consecutive days ever, per habit."
  type LongestStreaks {
    water: Int!
    steps: Int!
    sleep: Int!
    checkIn: Int!
  }

  type Achievements {
    earnedCount: Int!
    badges: [Badge!]!
    mostSteps: PersonalBest
    mostWater: PersonalBest
    longestSleep: PersonalBest
    longestStreaks: LongestStreaks!
  }

  extend type Query {
    "Badges and personal bests from the whole history. Streaks are judged against the current goals."
    achievements: Achievements!
  }
`;
