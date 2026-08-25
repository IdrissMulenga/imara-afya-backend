import { GraphQLError } from 'graphql';


//VALIDATION LIVES HERE, NOT ON THE PHONE.
//
//The app checks these too, but only so the user gets a fast, friendly message.
//Anyone can call the API directly with curl and skip the app entirely, so every
//rule that actually matters has to be enforced on this side as well.

const badInput = (message: string) =>
    new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT' } });


//deliberately simple: one @, a dot in the domain, no spaces. Trying to fully
//validate email with a regex is a losing game — real verification is sending mail.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const assertValidEmail = (email: string) => {
    if (!EMAIL_RE.test(email)) {
        throw badInput('Enter a valid email address');
    }

    //an absurdly long address is either a mistake or an attack
    if (email.length > 254) {
        throw badInput('That email address is too long');
    }
};


export const MIN_PASSWORD_LENGTH = 8;

export const assertValidPassword = (password: string) => {
    if (password.length < MIN_PASSWORD_LENGTH) {
        throw badInput(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }

    //bcrypt silently ignores anything past 72 bytes, so a longer password gives
    //a false sense of security — reject it rather than truncate it quietly
    if (Buffer.byteLength(password, 'utf8') > 72) {
        throw badInput('Password is too long. Please use 72 characters or fewer.');
    }
};


//NAMES ARE SHOWN BACK TO THE USER AND STORED — keep them sane.
//
//Returns the trimmed name, and callers should store what comes back. Signup
//used to validate the trimmed version and then save the raw one, so " Ana "
//was accepted as valid and then greeted the user with the spaces still on.
export const assertValidName = (value: string, label: string) => {
    const trimmed = value.trim();

    if (!trimmed) {
        throw badInput(`${label} cannot be empty`);
    }

    if (trimmed.length > 80) {
        throw badInput(`${label} is too long`);
    }

    return trimmed;
};


//guard the numeric profile fields so a typo can't poison the BMI calculation
export const assertInRange = (value: number, min: number, max: number, label: string) => {
    if (!Number.isFinite(value) || value < min || value > max) {
        throw badInput(`${label} must be between ${min} and ${max}`);
    }
};
