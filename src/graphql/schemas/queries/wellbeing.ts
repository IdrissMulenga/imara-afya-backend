export const wellbeingQuery = /* GraphQL */ `
    #the check-in card on the dashboard — today plus the streak behind it
    checkInSummary (days: Int) : CheckInSummary!
    myCheckIns (from: String, to: String) : [CheckIn!]!
    #what's due today (or on a given date), with each routine's tick state
    todayRoutines (date: String) : RoutineDay!
    myRoutines (includeArchived: Boolean) : [Routine!]!
`;
