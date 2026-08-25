export const medicationQuery = /* GraphQL */ `
    myMedications : [Medication!]!
    myMedicationLogs (medicationId: ID, date: String) : [MedicationDose!]!
    #Adherence over the last N days, ending today on the caller's calendar.
    #(No backticks in here — this whole block is a JS template literal, and a
    #backtick in a comment ends the string rather than being a comment.)
    medicationAdherence (days: Int, medicationId: ID) : AdherenceSummary!
`;
