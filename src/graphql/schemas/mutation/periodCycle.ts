export const periodCycleMutation = /* GraphQL */ `
    logPeriod (input: LogPeriodInput!) : PeriodCycle!
    updatePeriod (id: ID!, input: UpdatePeriodInput!) : PeriodCycle!
    removePeriod (id: ID!) : Boolean!
    setCycleRegularity (regularity: String!) : User!
`;
