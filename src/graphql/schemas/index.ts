import { userType, authPayload, signUpInput, completeProfileInput, setPreferencesInput, loginInput, changePasswordInput, resetPasswordInput, deleteAccountInput } from './types/user.js';
import { userQuery } from './queries/user.js';
import { userMutation } from './mutation/user.js';
import { healthRecordType, attachmentType, addHealthRecordInput, updateHealthRecordInput, addAttachmentInput } from './types/healthRecord.js';
import { healthRecordQuery } from './queries/healthRecord.js';
import { healthRecordMutation } from './mutation/healthRecord.js';
import { medicationType, medicationDoseType, adherenceType, addMedicationInput, updateMedicationInput } from './types/medication.js';
import { medicationQuery } from './queries/medication.js';
import { medicationMutation } from './mutation/medication.js';
import { periodCycleType, cyclePredictionType, logPeriodInput, updatePeriodInput } from './types/periodCycle.js';
import { periodCycleQuery } from './queries/periodCycle.js';
import { periodCycleMutation } from './mutation/periodCycle.js';
import { pregnancyType, pregnancyProgressType, startPregnancyInput, updatePregnancyInput, endPregnancyInput } from './types/pregnancy.js';
import { pregnancyQuery } from './queries/pregnancy.js';
import { pregnancyMutation } from './mutation/pregnancy.js';
import { habitLogType, habitSummaryType, logHabitInput } from './types/habit.js';
import { habitQuery } from './queries/habit.js';
import { habitMutation } from './mutation/habit.js';
import { guidanceType, addGuidanceInput } from './types/guidance.js';
import { checkInType, checkInSummaryType, routineType, routineDayType, checkInInput, routineInput, updateRoutineInput } from './types/wellbeing.js';
import { wellbeingQuery } from './queries/wellbeing.js';
import { wellbeingMutation } from './mutation/wellbeing.js';
import { guidanceQuery } from './queries/guidance.js';
import { guidanceMutation } from './mutation/guidance.js';

export const typeDefs = /* GraphQL */ `
    ${userType}

    ${authPayload}

    ${signUpInput}

    ${completeProfileInput}

    ${loginInput}

    ${changePasswordInput}

    ${resetPasswordInput}

    ${deleteAccountInput}

    ${healthRecordType}

    ${attachmentType}

    ${addHealthRecordInput}

    ${updateHealthRecordInput}

    ${addAttachmentInput}

    ${medicationType}

    ${medicationDoseType}

    ${adherenceType}

    ${addMedicationInput}

    ${updateMedicationInput}

    ${periodCycleType}

    ${cyclePredictionType}

    ${logPeriodInput}

    ${updatePeriodInput}

    ${pregnancyType}

    ${pregnancyProgressType}

    ${startPregnancyInput}

    ${updatePregnancyInput}

    ${endPregnancyInput}

    ${habitLogType}

    ${habitSummaryType}

    ${logHabitInput}

    ${guidanceType}

    ${addGuidanceInput}

    ${setPreferencesInput}

    ${checkInType}

    ${checkInSummaryType}

    ${routineType}

    ${routineDayType}

    ${checkInInput}

    ${routineInput}

    ${updateRoutineInput}

    type Query {
        ${userQuery}
        ${healthRecordQuery}
        ${medicationQuery}
        ${periodCycleQuery}
        ${pregnancyQuery}
        ${habitQuery}
        ${guidanceQuery}
        ${wellbeingQuery}
    }

    type Mutation {
        ${userMutation}
        ${healthRecordMutation}
        ${medicationMutation}
        ${periodCycleMutation}
        ${pregnancyMutation}
        ${habitMutation}
        ${guidanceMutation}
        ${wellbeingMutation}
    }
`;
