import { userType, authPayload, signUpInput, completeProfileInput, loginInput } from './types/user.js';
import { userQuery } from './queries/user.js';
import { userMutation } from './mutation/user.js';

export const typeDefs = /* GraphQL */ `
    ${userType}

    ${authPayload}

    ${signUpInput}

    ${completeProfileInput}

    ${loginInput}

    type Query {
        ${userQuery}
    }

    type Mutation {
        ${userMutation}
    }
`;
