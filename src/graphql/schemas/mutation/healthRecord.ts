export const healthRecordMutation = /* GraphQL */ `
    addHealthRecord (input: AddHealthRecordInput!) : HealthRecord!
    updateHealthRecord (id: ID!, input: UpdateHealthRecordInput!) : HealthRecord!
    removeHealthRecord (id: ID!) : Boolean!
`;
