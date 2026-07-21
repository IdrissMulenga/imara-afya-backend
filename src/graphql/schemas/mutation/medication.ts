export const medicationMutation = /* GraphQL */ `
    addMedication (input: AddMedicationInput!) : Medication!
    updateMedication (id: ID!, input: UpdateMedicationInput!) : Medication!
    removeMedication (id: ID!) : Boolean!
`;
