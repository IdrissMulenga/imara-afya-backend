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
