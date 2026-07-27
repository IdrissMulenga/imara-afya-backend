export const habitQuery = /* GraphQL */ `
    habitSummary : HabitSummary!
    myHabitLogs (type: String!, from: String, to: String) : [HabitLog!]!
`;
