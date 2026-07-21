export const userMutation = /* GraphQL */ `
    signup (input: SignUpInput!) : AuthPayload!
    login (input: LoginInput!) : AuthPayload!
    completeProfile (input: CompleteProfileInput!) : User!
    upgradeToPremium : User!
`;
