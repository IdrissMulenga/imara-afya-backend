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
