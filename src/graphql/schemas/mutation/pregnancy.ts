export const pregnancyMutation = /* GraphQL */ `
    startPregnancy (input: StartPregnancyInput!) : Pregnancy!
    updatePregnancy (id: ID!, input: UpdatePregnancyInput!) : Pregnancy!
    endPregnancy (id: ID!, input: EndPregnancyInput!) : Pregnancy!
    removePregnancy (id: ID!) : Boolean!
`;
