import { GraphQLError } from "graphql"
import type { Context } from "../graphql/context.js"
import { dayInZone, daysBetween } from "./datetime.js"


//THE THINGS EVERY RESOLVER NEEDS.
//
//Written because four resolvers had each grown their own copy of "is this a
//real date", "is this a valid time", and "what day is it for this user" — and
//the copies had drifted. Two of them were still using UTC for "today", which
//quietly produced wrong cycle predictions and due dates for anyone not on UTC.
//
//This file is deliberately NOT a general dumping ground. It holds one thing:
//the checks and lookups that sit at the top of a resolver, before any real work
//starts. Pure date arithmetic lives in datetime.ts, field-shape validation in
//validation.ts, and both stay free of GraphQL and of Context so they can be
//reasoned about on their own.


/* ------------------------------ shapes ------------------------------ */

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;


/* --------------------------- the user's day -------------------------- */

/**
 * Today, on the calendar in front of THIS user.
 *
 * Never `new Date().toISOString().slice(0, 10)` — that is the UTC day, and it
 * is wrong for most of the world for part of every day. In Bujumbura it is
 * wrong from midnight until 02:00, which is exactly when someone logs a dose
 * they took last thing at night.
 */
export const userToday = (context: Context) =>
    dayInZone(context.user!.get('timezone'));

/** A specific instant, expressed as a day on the user's own calendar. */
export const userDay = (context: Context, at: Date) =>
    dayInZone(context.user!.get('timezone'), at);


/* ---------------------------- assertions ----------------------------- */

const badInput = (message: string) =>
    new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT' } });


/** "YYYY-MM-DD", and a date that actually exists. Returns it for chaining. */
export const assertDate = (value: string, label = 'Date') => {
    if (!DATE_RE.test(value)) {
        throw badInput(`${label} must be in YYYY-MM-DD format`);
    }

    //The regex happily accepts 2026-02-31. `new Date()` does NOT reject it —
    //depending on the engine it either rolls over into March or parses fine —
    //so the only reliable test is to build the date and check it came back as
    //the same day. A record filed on a date that doesn't exist is invisible to
    //every screen that asks for the month it should be in.
    const [year, month, day] = value.split('-').map(Number);
    const built = new Date(Date.UTC(year, month - 1, day));

    if (
        built.getUTCFullYear() !== year ||
        built.getUTCMonth() !== month - 1 ||
        built.getUTCDate() !== day
    ) {
        throw badInput(`${label} must be a real date`);
    }

    return value;
};


/**
 * A day the user could actually have lived through.
 *
 * `today` is passed in rather than read here, so the caller decides whose
 * calendar is being used — and so this stays testable without a Context.
 */
export const assertNotFuture = (value: string, today: string, label = 'Date') => {
    if (daysBetween(value, today) < 0) {
        throw badInput(`${label} cannot be in the future`);
    }

    return value;
};


/** Both of the above, which is what almost every caller actually wants. */
export const assertPastDate = (value: string, today: string, label = 'Date') =>
    assertNotFuture(assertDate(value, label), today, label);


/**
 * A real moment in time, as an ISO string — not a calendar day.
 *
 * The dose logger takes one of these from the client so an offline phone can
 * send doses with the time they were actually taken. Unchecked, "banana" made
 * `new Date()` produce an Invalid Date, and passing that to Intl throws a
 * RangeError from inside the date helpers — a crash, not a validation error.
 *
 * A little clock skew between phone and server is normal and fine; a dose
 * "taken" next month is not, and would sit in the future of every list forever.
 */
export const assertInstant = (value: string, label = 'Timestamp') => {
    const at = new Date(value);

    if (Number.isNaN(at.getTime())) {
        throw badInput(`${label} must be a valid date and time`);
    }

    //one day of tolerance covers a phone with a badly set clock
    if (at.getTime() - Date.now() > 24 * 60 * 60 * 1000) {
        throw badInput(`${label} cannot be in the future`);
    }

    return value;
};


/** "HH:MM" on a 24-hour clock. */
export const assertTime = (value: string, label = 'Time') => {
    if (!TIME_RE.test(value)) {
        throw badInput(`${label} must be in HH:MM format`);
    }

    return value;
};


/** A whole number within an inclusive range — mood, energy, and similar. */
export const assertScale = (value: number, min: number, max: number, label: string) => {
    if (!Number.isInteger(value) || value < min || value > max) {
        throw badInput(`${label} must be a whole number from ${min} to ${max}`);
    }

    return value;
};


/* ---------------------------- upserts -------------------------------- */

/**
 * Run an upsert, and run it again if two of them collided.
 *
 * Mongo's own documented behaviour: `findOneAndUpdate` with `upsert` is NOT
 * atomic against a unique index. Two requests can both find nothing and both
 * try to insert, and the loser gets a duplicate-key error (E11000).
 *
 * That is not a theoretical race here. Every upsert in this codebase sits
 * behind a button — tick a dose, save a check-in, tick a routine — on phones
 * with 2G connections, where the app retries a request it thinks timed out
 * while the first one is still in flight. The user tapped once and would have
 * been told their dose failed to save.
 *
 * The retry always succeeds, because by then the document the first attempt
 * inserted is there to be found and updated. Once only: a second failure means
 * something other than a race.
 */
export const upsertRetryingOnDuplicate = async <T>(run: () => Promise<T>): Promise<T> => {
    try {
        return await run();
    } catch (error) {
        if ((error as { code?: number })?.code !== 11000) throw error;

        return run();
    }
};


/* ----------------------------- errors -------------------------------- */

/**
 * The end of every resolver's catch block.
 *
 * A GraphQLError we threw ourselves carries a code the app reads, so it passes
 * straight through. Anything else is unexpected, and is replaced with a message
 * that says what failed without leaking a stack trace or a Mongo error to the
 * client.
 *
 *   } catch (error) {
 *     throw rethrow(error, 'Unexpected error while logging a dose', 'DOSE_LOG_FAILED');
 *   }
 *
 * `invalidMessage` is what a mongoose ValidationError becomes — an enum or
 * required-field failure is the caller sending nonsense, not the server
 * breaking, so it earns BAD_USER_INPUT and a message that says so. Left off, it
 * falls back to the same message as everything else.
 *
 * Returned rather than thrown so the call site still reads as `throw` — control
 * flow stays visible instead of hiding inside a helper.
 */
export const rethrow = (
    error: unknown,
    message: string,
    code: string,
    invalidMessage = message,
) => {
    if (error instanceof GraphQLError) return error;

    if ((error as { name?: string })?.name === 'ValidationError') {
        return badInput(invalidMessage);
    }

    return new GraphQLError(message, { extensions: { code } });
};
