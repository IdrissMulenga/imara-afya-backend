export const pregnancyType = /* GraphQL */ `
    type Pregnancy {
        id: ID!
        lastPeriodDate: String!
        endedAt: String
        outcome: String
        note: String
    }
`;

export const pregnancyProgressType = /* GraphQL */ `
    type PregnancyProgress {
        active: Boolean!
        pregnancy: Pregnancy
        dueDate: String
        weeksPregnant: Int
        daysIntoWeek: Int
        trimester: Int
        daysUntilDue: Int
        overdue: Boolean
    }
`;

export const startPregnancyInput = /* GraphQL */ `
    input StartPregnancyInput {
        lastPeriodDate: String!
        note: String
    }
`;

export const updatePregnancyInput = /* GraphQL */ `
    input UpdatePregnancyInput {
        lastPeriodDate: String
        note: String
    }
`;

export const endPregnancyInput = /* GraphQL */ `
    input EndPregnancyInput {
        endedAt: String
        outcome: String
        note: String
    }
`;
