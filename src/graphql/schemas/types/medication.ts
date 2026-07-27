export const medicationType = /* GraphQL */ `
    type Medication {
        id: ID!
        name: String!
        dosage: String
        times: [String!]!
        frequency: String!
        active: Boolean!
    }
`;

export const medicationDoseType = /* GraphQL */ `
    type MedicationDose {
        id: ID!
        medicationId: ID!
        status: String!
        takenAt: String!
    }
`;

export const addMedicationInput = /* GraphQL */ `
    input AddMedicationInput {
        name: String!
        dosage: String
        times: [String!]
        frequency: String
    }
`;

export const updateMedicationInput = /* GraphQL */ `
    input UpdateMedicationInput {
        name: String
        dosage: String
        times: [String!]
        frequency: String
        active: Boolean
    }
`;
