import { userType, authPayload, signUpInput, completeProfileInput } from './types/user.js';
import { userQuery } from './queries/user.js';
import { userMutation } from './mutation/user.js';

export const typeDefs = /* GraphQL */ `
    ${userType}

    ${authPayload}

    ${signUpInput}

    ${completeProfileInput}

    type Query {
        ${userQuery}
    }

    type Mutation {
        ${userMutation}
    }
`;
