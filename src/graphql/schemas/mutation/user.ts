export const userMutation = /* GraphQL */ `
    signup (input: SignUpInput!) : AuthPayload!
    login (input: LoginInput!) : AuthPayload!
    completeProfile (input: CompleteProfileInput!) : User!
    upgradeToPremium : User!
    setPreferences (input: SetPreferencesInput!) : User!
    refreshSession : AuthPayload!
    logout : Boolean!
    changePassword (input: ChangePasswordInput!) : AuthPayload!
    requestPasswordReset (email: String!) : Boolean!
    resetPassword (input: ResetPasswordInput!) : AuthPayload!
    deleteAccount (input: DeleteAccountInput!) : Boolean!
`;
