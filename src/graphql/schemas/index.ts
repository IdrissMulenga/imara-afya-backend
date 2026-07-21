import { userType, authPayload, signUpInput, completeProfileInput, loginInput } from './types/user.js';
import { userQuery } from './queries/user.js';
import { userMutation } from './mutation/user.js';
import { healthRecordType, attachmentType, addHealthRecordInput, updateHealthRecordInput, addAttachmentInput } from './types/healthRecord.js';
import { healthRecordQuery } from './queries/healthRecord.js';
import { healthRecordMutation } from './mutation/healthRecord.js';
import { medicationType, addMedicationInput, updateMedicationInput } from './types/medication.js';
import { medicationQuery } from './queries/medication.js';
import { medicationMutation } from './mutation/medication.js';
import { periodCycleType, cyclePredictionType, logPeriodInput, updatePeriodInput } from './types/periodCycle.js';
import { periodCycleQuery } from './queries/periodCycle.js';
import { periodCycleMutation } from './mutation/periodCycle.js';
import { hospitalType, addHospitalInput } from './types/hospital.js';
import { hospitalQuery } from './queries/hospital.js';
import { hospitalMutation } from './mutation/hospital.js';

export const typeDefs = /* GraphQL */ `
    ${userType}

    ${authPayload}

    ${signUpInput}

    ${completeProfileInput}

    ${loginInput}

    ${healthRecordType}

    ${attachmentType}

    ${addHealthRecordInput}

    ${updateHealthRecordInput}

    ${addAttachmentInput}

    ${medicationType}

    ${addMedicationInput}

    ${updateMedicationInput}

    ${periodCycleType}

    ${cyclePredictionType}

    ${logPeriodInput}

    ${updatePeriodInput}

    ${hospitalType}

    ${addHospitalInput}

    type Query {
        ${userQuery}
        ${healthRecordQuery}
        ${medicationQuery}
        ${periodCycleQuery}
        ${hospitalQuery}
    }

    type Mutation {
        ${userMutation}
        ${healthRecordMutation}
        ${medicationMutation}
        ${periodCycleMutation}
        ${hospitalMutation}
    }
`;
