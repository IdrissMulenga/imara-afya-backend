export const checkInType = /* GraphQL */ `
    type CheckIn {
        id: ID!
        date: String!
        mood: Int!
        energy: Int!
        note: String
    }
`;

export const checkInSummaryType = /* GraphQL */ `
    type CheckInSummary {
        #today's entry, or null if she hasn't checked in yet
        today: CheckIn
        #consecutive days checked in, counting back from today
        streak: Int!
        #averages over the requested window, null until there is anything to average
        averageMood: Float
        averageEnergy: Float
        #how many of the last N days have an entry
        loggedDays: Int!
        windowDays: Int!
    }
`;

export const routineType = /* GraphQL */ `
    type Routine {
        id: ID!
        title: String!
        icon: String!
        #0 = Sunday .. 6 = Saturday. Empty means every day.
        days: [Int!]!
        time: String
        active: Boolean!
        position: Int!
        #filled in by todayRoutines — whether it's been ticked for the day asked about
        done: Boolean
        #consecutive days completed, counting only days it was actually due
        streak: Int
    }
`;

export const routineDayType = /* GraphQL */ `
    type RoutineDay {
        date: String!
        #only the routines actually due on this weekday
        routines: [Routine!]!
        doneCount: Int!
        dueCount: Int!
    }
`;

export const checkInInput = /* GraphQL */ `
    input CheckInInput {
        mood: Int!
        energy: Int!
        note: String
        #defaults to today in the user's timezone
        date: String
    }
`;

export const routineInput = /* GraphQL */ `
    input RoutineInput {
        title: String!
        icon: String
        days: [Int!]
        time: String
    }
`;

export const updateRoutineInput = /* GraphQL */ `
    input UpdateRoutineInput {
        title: String
        icon: String
        days: [Int!]
        time: String
        active: Boolean
        position: Int
    }
`;
