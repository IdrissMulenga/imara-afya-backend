import { addDays, daysBetween } from "./datetime.js"


//WAS THIS MEDICINE DUE ON THIS DAY, AND HOW MANY DOSES.
//
//One place, because three separate features need the same answer and they must
//not disagree: the reminder scheduler on the phone, the "outstanding today"
//count on the dashboard, and the adherence percentage. If any two of those
//compute it differently, the app tells the user three different things about
//the same medicine.
//
//Everything here is pure — plain "YYYY-MM-DD" strings in, booleans and numbers
//out. No database, no Context, no GraphQL. That is what makes it testable, and
//this is logic that has to be right: an adherence figure built on a wrong
//denominator is worse than no adherence figure, because people act on it.


export type DoseSchedule = {
    /** "daily" | "alternate" | "specificDays" */
    frequency?: string | null;
    /** weekday numbers, 0 = Sunday. Only read when frequency is specificDays. */
    days?: number[] | null;
    /** "YYYY-MM-DD", or null for "since forever" */
    startDate?: string | null;
    /** "YYYY-MM-DD", or null for "ongoing" */
    endDate?: string | null;
    /** the scheduled clock times, e.g. ["08:00", "20:00"] */
    times?: string[] | null;
    active?: boolean | null;
};


/** Which weekday a "YYYY-MM-DD" falls on, 0 = Sunday. Built from UTC so it
 *  cannot shift with the server's own zone. */
export const weekdayOf = (day: string) => {
    const [y, m, d] = day.split('-').map(Number);

    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};


/** Is `day` inside the course, if there is one? */
export const withinCourse = (medication: DoseSchedule, day: string) => {
    const { startDate, endDate } = medication;

    if (startDate && daysBetween(startDate, day) < 0) return false;
    if (endDate && daysBetween(day, endDate) < 0) return false;

    return true;
};


/**
 * IS THIS MEDICINE DUE ON THIS DAY?
 *
 * A paused medicine is never due. Neither is one outside its course, nor a
 * weekday-only medicine on the wrong weekday.
 *
 * "alternate" counts from the START of the course, not from today — otherwise
 * the same medicine is due or not depending on when you happen to ask, and a
 * every-other-day tablet would drift by a day every time the phone was off
 * overnight. With no start date there is nothing to count from, so it falls
 * back to treating every day as due rather than inventing an anchor.
 */
export const isDueOn = (medication: DoseSchedule, day: string): boolean => {
    if (medication.active === false) return false;
    if (!withinCourse(medication, day)) return false;

    switch (medication.frequency) {
        case 'alternate': {
            if (!medication.startDate) return true;

            return daysBetween(medication.startDate, day) % 2 === 0;
        }

        case 'specificDays': {
            const days = medication.days ?? [];

            //an empty list would otherwise mean "never", which is not something
            //anyone sets on purpose — treat it as every day, like routines do
            return !days.length || days.includes(weekdayOf(day));
        }

        default:
            return true;
    }
};


/** How many doses this medicine should be taken on this day — 0 when not due,
 *  and 0 for an as-needed medicine, which has no scheduled doses to miss. */
export const dosesDueOn = (medication: DoseSchedule, day: string) =>
    (isDueOn(medication, day) ? (medication.times ?? []).length : 0);


/**
 * THE DAYS A COURSE ACTUALLY COVERS, oldest first.
 *
 * Bounded by `limit` because this feeds an adherence window and an unbounded
 * loop over user-supplied dates is a request that never returns.
 */
export const scheduledDaysBetween = (
    medication: DoseSchedule,
    from: string,
    to: string,
    limit = 400,
) => {
    const days: string[] = [];

    const span = daysBetween(from, to);

    if (span < 0) return days;

    for (let i = 0; i <= Math.min(span, limit); i += 1) {
        const day = addDays(from, i);

        if (isDueOn(medication, day)) days.push(day);
    }

    return days;
};


/**
 * HOW MANY DAYS OF STOCK ARE LEFT.
 *
 * Null when the user isn't tracking stock, or when the medicine has no
 * scheduled doses to consume it — an as-needed painkiller has no daily burn
 * rate, so any "days left" figure would be invented.
 */
export const daysOfStockLeft = (
    medication: DoseSchedule & { stock?: number | null; stockPerDose?: number | null },
) => {
    const { stock } = medication;

    if (stock == null) return null;

    const perDay = (medication.times ?? []).length * (medication.stockPerDose ?? 1);

    if (perDay <= 0) return null;

    //alternate-day medicines burn stock half as fast, and a weekday-only one
    //five sevenths as fast — a "days left" that ignores this sends someone to
    //the pharmacy a week early
    const factor =
        medication.frequency === 'alternate' ? 0.5
            : medication.frequency === 'specificDays' && medication.days?.length
                ? medication.days.length / 7
                : 1;

    return Math.floor(stock / (perDay * factor));
};
