export const habitLogType = /* GraphQL */ `
    type HabitLog {
        id: ID!
        type: String!
        value: Float!
        date: String!
    }
`;

export const habitSummaryType = /* GraphQL */ `
    type HabitSummary {
        date: String!
        waterToday: Float!
        waterGoal: Float!
        waterGoalMet: Boolean!
        waterStreak: Int!
        sleepLastNight: Float
        latestWeight: Float
        bmi: Float
        bmiCategory: String
    }
`;

export const logHabitInput = /* GraphQL */ `
    input LogHabitInput {
        type: String!
        value: Float!
        date: String
    }
`;
