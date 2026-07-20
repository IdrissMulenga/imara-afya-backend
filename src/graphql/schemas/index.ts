import { userType, authPayload, signUpInput, completeProfileInput, loginInput } from './types/user.js';
import { userQuery } from './queries/user.js';
import { userMutation } from './mutation/user.js';
import { healthRecordType, addHealthRecordInput, updateHealthRecordInput } from './types/healthRecord.js';
import { healthRecordQuery } from './queries/healthRecord.js';
import { healthRecordMutation } from './mutation/healthRecord.js';

export const typeDefs = /* GraphQL */ `
    ${userType}

    ${authPayload}

    ${signUpInput}

    ${completeProfileInput}

    ${loginInput}

    ${healthRecordType}

    ${addHealthRecordInput}

    ${updateHealthRecordInput}

    type Query {
        ${userQuery}
        ${healthRecordQuery}
    }

    type Mutation {
        ${userMutation}
        ${healthRecordMutation}
    }
`;
