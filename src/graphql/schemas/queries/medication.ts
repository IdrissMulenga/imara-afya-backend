export const medicationQuery = /* GraphQL */ `
    myMedications : [Medication!]!
    myMedicationLogs (medicationId: ID, date: String) : [MedicationDose!]!
`;
