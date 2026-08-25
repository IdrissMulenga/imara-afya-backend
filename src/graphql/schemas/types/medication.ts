export const medicationType = /* GraphQL */ `
    type Medication {
        id: ID!
        name: String!
        dosage: String
        times: [String!]!
        #"daily" | "alternate" | "specificDays"
        frequency: String!
        #weekday numbers, 0 = Sunday. Only meaningful for "specificDays".
        days: [Int!]!
        #the course, when there is one. Null start means "since forever",
        #null end means "ongoing" — which is the common case.
        startDate: String
        endDate: String
        #what is left in the packet, when the user chose to track it
        stock: Int
        stockPerDose: Int
        refillAtDays: Int
        #COMPUTED, not stored — how many days the remaining stock covers at this
        #medicine's own rate. Null when stock isn't tracked or there is no
        #schedule to burn it.
        daysOfStockLeft: Int
        #is it due today, on the caller's own calendar?
        dueToday: Boolean!
        active: Boolean!
    }
`;

export const medicationDoseType = /* GraphQL */ `
    type MedicationDose {
        id: ID!
        medicationId: ID!
        status: String!
        takenAt: String!
        #the scheduled time this dose belongs to, e.g. "08:00".
        #null for a medicine with no set times, taken as needed.
        slot: String
        #the user's own calendar day, not a UTC one
        localDate: String!
    }
`;

//ADHERENCE.
//
//Computed from what was DUE rather than from what was logged — a percentage
//over "doses you recorded" is always 100% and tells nobody anything. The
//denominator comes from each medicine's frequency and course dates, which is
//why that logic lives in one shared place.
export const adherenceType = /* GraphQL */ `
    type AdherenceDay {
        date: String!
        due: Int!
        taken: Int!
    }

    type AdherenceSlot {
        slot: String!
        due: Int!
        taken: Int!
    }

    type AdherenceSummary {
        from: String!
        to: String!
        due: Int!
        taken: Int!
        #0-100, rounded. Null when nothing was due in the window — there is no
        #honest percentage of zero, and showing 0% to someone whose course
        #hasn't started yet is just wrong.
        percent: Int
        #consecutive days, ending today, where every due dose was taken
        streak: Int
        days: [AdherenceDay!]!
        #which time of day gets missed most — usually the evening one
        bySlot: [AdherenceSlot!]!
    }
`;

export const addMedicationInput = /* GraphQL */ `
    input AddMedicationInput {
        name: String!
        dosage: String
        times: [String!]
        frequency: String
        days: [Int!]
        startDate: String
        endDate: String
        stock: Int
        stockPerDose: Int
        refillAtDays: Int
    }
`;

export const updateMedicationInput = /* GraphQL */ `
    input UpdateMedicationInput {
        name: String
        dosage: String
        times: [String!]
        frequency: String
        days: [Int!]
        startDate: String
        endDate: String
        stock: Int
        stockPerDose: Int
        refillAtDays: Int
        active: Boolean
    }
`;
