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

export type CompleteProfileArgs = {
    input: {
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

export type NearbyHospitalsArgs = {
    latitude: number;
    longitude: number;
    radiusKm?: number;
};

export type AddHospitalArgs = {
    input: {
        name: string;
        address?: string;
        phone?: string;
        latitude: number;
        longitude: number;
    };
};
