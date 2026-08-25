export const medicationMutation = /* GraphQL */ `
    addMedication (input: AddMedicationInput!) : Medication!
    updateMedication (id: ID!, input: UpdateMedicationInput!) : Medication!
    removeMedication (id: ID!) : Boolean!
    markMedicationTaken (medicationId: ID!, slot: String, takenAt: String, status: String) : MedicationDose!
    #untick a dose — a mis-tap should not be permanent until midnight
    unmarkMedicationTaken (medicationId: ID!, slot: String, date: String) : Boolean!
`;
