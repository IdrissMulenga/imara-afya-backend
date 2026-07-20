export const healthRecordType = /* GraphQL */ `
    type HealthRecord {
        id: ID!
        type: String!
        name: String!
        note: String
    }
`;

export const addHealthRecordInput = /* GraphQL */ `
    input AddHealthRecordInput {
        type: String!
        name: String!
        note: String
    }
`;

export const updateHealthRecordInput = /* GraphQL */ `
    input UpdateHealthRecordInput {
        name: String
        note: String
    }
`;
