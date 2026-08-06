import { userType, authPayload, signUpInput, completeProfileInput, loginInput, changePasswordInput, resetPasswordInput, deleteAccountInput } from './types/user.js';
import { userQuery } from './queries/user.js';
import { userMutation } from './mutation/user.js';
import { healthRecordType, attachmentType, addHealthRecordInput, updateHealthRecordInput, addAttachmentInput } from './types/healthRecord.js';
import { healthRecordQuery } from './queries/healthRecord.js';
import { healthRecordMutation } from './mutation/healthRecord.js';
import { medicationType, medicationDoseType, addMedicationInput, updateMedicationInput } from './types/medication.js';
import { medicationQuery } from './queries/medication.js';
import { medicationMutation } from './mutation/medication.js';
import { periodCycleType, cyclePredictionType, logPeriodInput, updatePeriodInput } from './types/periodCycle.js';
import { periodCycleQuery } from './queries/periodCycle.js';
import { periodCycleMutation } from './mutation/periodCycle.js';
import { pregnancyType, pregnancyProgressType, startPregnancyInput, updatePregnancyInput, endPregnancyInput } from './types/pregnancy.js';
import { pregnancyQuery } from './queries/pregnancy.js';
import { pregnancyMutation } from './mutation/pregnancy.js';
import { hospitalType, mapRegionType, careMapType, careMapInput, addHospitalInput } from './types/hospital.js';
import { hospitalQuery } from './queries/hospital.js';
import { hospitalMutation } from './mutation/hospital.js';
import { habitLogType, habitSummaryType, logHabitInput } from './types/habit.js';
import { habitQuery } from './queries/habit.js';
import { habitMutation } from './mutation/habit.js';
import { ramadanScheduleType, adjustedMedicationType, setRamadanModeInput } from './types/ramadan.js';
import { ramadanQuery } from './queries/ramadan.js';
import { ramadanMutation } from './mutation/ramadan.js';
import { guidanceType, addGuidanceInput } from './types/guidance.js';
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

    ${hospitalType}

    ${mapRegionType}

    ${careMapType}

    ${careMapInput}

    ${addHospitalInput}

    ${habitLogType}

    ${habitSummaryType}

    ${logHabitInput}

    ${ramadanScheduleType}

    ${adjustedMedicationType}

    ${setRamadanModeInput}

    ${guidanceType}

    ${addGuidanceInput}

    type Query {
        ${userQuery}
        ${healthRecordQuery}
        ${medicationQuery}
        ${periodCycleQuery}
        ${pregnancyQuery}
        ${hospitalQuery}
        ${habitQuery}
        ${ramadanQuery}
        ${guidanceQuery}
    }

    type Mutation {
        ${userMutation}
        ${healthRecordMutation}
        ${medicationMutation}
        ${periodCycleMutation}
        ${pregnancyMutation}
        ${hospitalMutation}
        ${habitMutation}
        ${ramadanMutation}
        ${guidanceMutation}
    }
`;
