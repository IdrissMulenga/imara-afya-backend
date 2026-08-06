export const userType = /* GraphQL */ `
    type User {
        id: ID!
        firstName: String!
        lastName: String!
        email: String!
        agreedToTerms: Boolean!
        image: String
        height: Float
        weight: Float
        gender: String
        religion: String
        plan: String!
        role: String!
        waterGoal: Float
        cycleRegularity: String
        ramadanMode: Boolean
        suhoorTime: String
        iftarTime: String
    }
`;

export const authPayload = /* GraphQL */ `
    type AuthPayload {
        token: String!
        user: User!
    }
`;

export const signUpInput = /* GraphQL */ `
    input SignUpInput {
        firstName: String!
        lastName: String!
        email: String!
        password: String!
        gender: String!
        agreeToTerms: Boolean!
    }
`;

export const completeProfileInput = /* GraphQL */ `
    input CompleteProfileInput {
        firstName: String
        lastName: String
        image: String
        height: Float
        weight: Float
        religion: String
    }
`;

export const loginInput = /* GraphQL */ `
    input LoginInput {
        email: String!
        password: String!
    }
`;

export const changePasswordInput = /* GraphQL */ `
    input ChangePasswordInput {
        currentPassword: String!
        newPassword: String!
    }
`;

export const deleteAccountInput = /* GraphQL */ `
    input DeleteAccountInput {
        # re-entered on purpose: this is irreversible, and an unlocked phone
        # should not be enough to erase someone's health history
        password: String!
    }
`;

export const resetPasswordInput = /* GraphQL */ `
    input ResetPasswordInput {
        email: String!
        token: String!
        newPassword: String!
    }
`;
