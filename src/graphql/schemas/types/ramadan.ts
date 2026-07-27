export const ramadanScheduleType = /* GraphQL */ `
    type RamadanSchedule {
        enabled: Boolean!
        suhoorTime: String
        iftarTime: String
        medications: [AdjustedMedication!]!
    }
`;

export const adjustedMedicationType = /* GraphQL */ `
    type AdjustedMedication {
        id: ID!
        name: String!
        originalTimes: [String!]!
        adjustedTimes: [String!]!
    }
`;

export const setRamadanModeInput = /* GraphQL */ `
    input SetRamadanModeInput {
        enabled: Boolean!
        suhoorTime: String
        iftarTime: String
    }
`;
