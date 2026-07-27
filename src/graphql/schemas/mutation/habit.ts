export const habitMutation = /* GraphQL */ `
    logHabit (input: LogHabitInput!) : HabitLog!
    removeHabitLog (id: ID!) : Boolean!
    setWaterGoal (glasses: Float!) : User!
`;
