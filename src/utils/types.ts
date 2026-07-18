export type SignupArgs = {
    input: {
        firstName: string;
        lastName: string;
        email: string;
        password: string;
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
        gender?: string;
        religion?: string;
    };
};
