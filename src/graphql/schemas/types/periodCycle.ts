export const periodCycleType = /* GraphQL */ `
    type PeriodCycle {
        id: ID!
        startDate: String!
        endDate: String
    }
`;

export const cyclePredictionType = /* GraphQL */ `
    type CyclePrediction {
        basedOnCycles: Int!
        averageCycleLength: Int!
        averagePeriodLength: Int
        # how far her cycles actually vary, in days (0 = perfectly even)
        cycleVariation: Int
        # "high" | "medium" | "low" — whether the prediction is worth trusting
        confidence: String!
        # her own answer: "regular" | "irregular" | "unknown"
        regularity: String!
        # true when the logged data itself looks irregular enough to mention
        irregularityFlag: Boolean!
        nextPeriodDate: String
        fertileWindowStart: String
        fertileWindowEnd: String
        daysUntilNextPeriod: Int
        daysUntilFertileWindow: Int
    }
`;

export const logPeriodInput = /* GraphQL */ `
    input LogPeriodInput {
        startDate: String!
        endDate: String
    }
`;

export const updatePeriodInput = /* GraphQL */ `
    input UpdatePeriodInput {
        startDate: String
        endDate: String
    }
`;
