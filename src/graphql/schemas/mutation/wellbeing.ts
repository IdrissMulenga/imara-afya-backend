export const wellbeingMutation = /* GraphQL */ `
    #one entry per day — calling it again on the same day edits that entry
    saveCheckIn (input: CheckInInput!) : CheckIn!
    removeCheckIn (date: String!) : Boolean!
    addRoutine (input: RoutineInput!) : Routine!
    updateRoutine (id: ID!, input: UpdateRoutineInput!) : Routine!
    removeRoutine (id: ID!) : Boolean!
    #tick / untick for a day; returns the routine with its new streak
    setRoutineDone (id: ID!, done: Boolean!, date: String) : Routine!
`;
