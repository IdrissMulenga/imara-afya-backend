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
        agreeToTerms: Boolean!
    }
`;

export const completeProfileInput = /* GraphQL */ `
    input CompleteProfileInput {
        image: String
        height: Float
        weight: Float
        gender: String
        religion: String
    }
`;
