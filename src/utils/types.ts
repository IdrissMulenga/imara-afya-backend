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
        religion?: string;
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
    };
};

export type UpdateMedicationArgs = {
    id: string;
    input: {
        name?: string;
        dosage?: string;
        times?: string[];
        frequency?: string;
        active?: boolean;
    };
};

export type RemoveMedicationArgs = {
    id: string;
};

export type MarkMedicationTakenArgs = {
    medicationId: string;
    takenAt?: string;
    status?: string;
};

export type MyMedicationLogsArgs = {
    medicationId?: string;
    date?: string;
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

export type NearbyHospitalsArgs = {
    latitude: number;
    longitude: number;
    radiusKm?: number;
};

export type HospitalsArgs = {
    city?: string;
    province?: string;
    type?: string;
};

//every field is optional: the screen opens with no filters and no location,
//and each one narrows the result as she supplies it
export type CareMapArgs = {
    input?: {
        latitude?: number;
        longitude?: number;
        radiusKm?: number;
        type?: string;
        search?: string;
        city?: string;
        province?: string;
    };
};

export type AddHospitalArgs = {
    input: {
        name: string;
        address?: string;
        phone?: string;
        latitude: number;
        longitude: number;
        city?: string;
        province?: string;
        type?: string;
    };
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

export type SetRamadanModeArgs = {
    input: {
        enabled: boolean;
        suhoorTime?: string;
        iftarTime?: string;
    };
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
