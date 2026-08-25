export type SignupArgs = {
    input: {
        firstName: string;
        lastName: string;
        email: string;
        password: string;
        gender: string;
        agreeToTerms: boolean;
    };
};

export type LoginArgs = {
    input: {
        email: string;
        password: string;
    };
};

export type ChangePasswordArgs = {
    input: {
        currentPassword: string;
        newPassword: string;
    };
};

export type RequestPasswordResetArgs = {
    email: string;
};

export type ResetPasswordArgs = {
    input: {
        email: string;
        token: string;
        newPassword: string;
    };
};

export type DeleteAccountArgs = {
    input: {
        password: string;
    };
};

export type CompleteProfileArgs = {
    input: {
        firstName?: string;
        lastName?: string;
        image?: string;
        height?: number;
        weight?: number;
    };
};

export type MyHealthRecordsArgs = {
    type?: string;
};

export type AddHealthRecordArgs = {
    input: {
        type: string;
        name: string;
        note?: string;
    };
};

export type UpdateHealthRecordArgs = {
    id: string;
    input: {
        name?: string;
        note?: string;
    };
};

export type RemoveHealthRecordArgs = {
    id: string;
};

export type AddAttachmentArgs = {
    recordId: string;
    input: {
        url: string;
        name?: string;
    };
};

export type RemoveAttachmentArgs = {
    recordId: string;
    attachmentId: string;
};

export type AddMedicationArgs = {
    input: {
        name: string;
        dosage?: string;
        times?: string[];
        frequency?: string;
        days?: number[];
        startDate?: string;
        endDate?: string;
        stock?: number;
        stockPerDose?: number;
        refillAtDays?: number;
    };
};

export type UpdateMedicationArgs = {
    id: string;
    input: {
        name?: string;
        dosage?: string;
        times?: string[];
        frequency?: string;
        days?: number[];
        startDate?: string;
        endDate?: string;
        stock?: number;
        stockPerDose?: number;
        refillAtDays?: number;
        active?: boolean;
    };
};

export type RemoveMedicationArgs = {
    id: string;
};

export type MarkMedicationTakenArgs = {
    medicationId: string;
    slot?: string;
    takenAt?: string;
    status?: string;
};

export type UnmarkMedicationTakenArgs = {
    medicationId: string;
    slot?: string;
    date?: string;
};

export type MyMedicationLogsArgs = {
    medicationId?: string;
    date?: string;
};

export type MedicationAdherenceArgs = {
    days?: number;
    medicationId?: string;
};

export type LogPeriodArgs = {
    input: {
        startDate: string;
        endDate?: string;
    };
};

export type UpdatePeriodArgs = {
    id: string;
    input: {
        startDate?: string;
        endDate?: string;
    };
};

export type RemovePeriodArgs = {
    id: string;
};

export type SetCycleRegularityArgs = {
    regularity: string;
};

export type StartPregnancyArgs = {
    input: {
        lastPeriodDate: string;
        note?: string;
    };
};

export type UpdatePregnancyArgs = {
    id: string;
    input: {
        lastPeriodDate?: string;
        note?: string;
    };
};

export type EndPregnancyArgs = {
    id: string;
    input: {
        endedAt?: string;
        outcome?: string;
        note?: string;
    };
};

export type RemovePregnancyArgs = {
    id: string;
};

export type LogHabitArgs = {
    input: {
        type: string;
        value: number;
        date?: string;
    };
};

export type MyHabitLogsArgs = {
    type: string;
    from?: string;
    to?: string;
};

export type RemoveHabitLogArgs = {
    id: string;
};

export type SetWaterGoalArgs = {
    glasses: number;
};

export type GuidanceArgs = {
    category?: string;
    language?: string;
};

export type AddGuidanceArgs = {
    input: {
        category: string;
        kind: string;
        title: string;
        body: string;
        source?: string;
        language?: string;
        published?: boolean;
    };
};

export type SetPreferencesArgs = {
    input: {
        timezone?: string;
        unitSystem?: string;
    };
};

/* ------------------- check-ins and routines --------------------- */

export type CheckInSummaryArgs = { days?: number };
export type MyCheckInsArgs = { from?: string; to?: string };

export type SaveCheckInArgs = {
    input: {
        mood: number;
        energy: number;
        note?: string;
        date?: string;
    };
};

export type RemoveCheckInArgs = { date: string };

export type TodayRoutinesArgs = { date?: string };
export type MyRoutinesArgs = { includeArchived?: boolean };

export type AddRoutineArgs = {
    input: {
        title: string;
        icon?: string;
        days?: number[];
        time?: string;
    };
};

export type UpdateRoutineArgs = {
    id: string;
    input: {
        title?: string;
        icon?: string;
        days?: number[];
        time?: string;
        active?: boolean;
        position?: number;
    };
};

export type RemoveRoutineArgs = { id: string };
export type SetRoutineDoneArgs = { id: string; done: boolean; date?: string };
