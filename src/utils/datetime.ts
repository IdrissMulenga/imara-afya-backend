import { GraphQLError } from "graphql"


//DATES, IN THE USER'S OWN DAY.
//
//"Today" is not a server fact. When it is 01:00 on Tuesday in Bujumbura it is
//still Monday in UTC, and it is Monday evening in New York. Any feature that
//groups by day — doses taken, water drunk, a check-in, a routine ticked — has
//to agree with the calendar on the wall in front of the person using it.
//
//Everything here uses the platform's own timezone database through Intl, so
//there is no library to install and no offset table to keep up to date. DST is
//handled for us, which matters the moment the app leaves Burundi: Bujumbura has
//no daylight saving, most of Europe and North America do.

export const DEFAULT_TIMEZONE = 'UTC';

//"en-CA" formats as YYYY-MM-DD, which is exactly the shape we store.
const ISO_DAY = 'en-CA';


//Is this a timezone this machine actually knows about?
//
//Checked rather than trusted because the value arrives from the app, and an
//unknown zone makes Intl throw at the point of use — which would be somewhere
//deep inside a resolver rather than here at the edge.
//
//Answers are remembered. Building an Intl.DateTimeFormat is not free, the set
//of real zone names is small and fixed, and `userToday()` runs several times in
//a single request — so without this every dashboard load was constructing a
//dozen formatters purely to ask a question with the same answer every time.
const zoneIsKnown = new Set<string>();

export const isValidTimezone = (timezone: string) => {
    if (!timezone) return false;

    if (zoneIsKnown.has(timezone)) return true;

    try {
        new Intl.DateTimeFormat(ISO_DAY, { timeZone: timezone });
    } catch {
        //Deliberately NOT remembered. assertValidTimezone passes whatever the
        //app sent straight to this, so caching rejections would let anyone grow
        //the map without limit by saving nonsense timezones over and over.
        //Valid names come from a fixed list of a few hundred, so that half is
        //safe to keep.
        return false;
    }

    zoneIsKnown.add(timezone);

    return true;
};


export const assertValidTimezone = (timezone: string) => {
    if (!isValidTimezone(timezone)) {
        throw new GraphQLError(
            'Unknown timezone. Expected an IANA name such as Africa/Bujumbura.',
            { extensions: { code: 'BAD_USER_INPUT' } },
        );
    }

    return timezone;
};


//The calendar date in a given zone, as "YYYY-MM-DD".
export const dayInZone = (timezone = DEFAULT_TIMEZONE, at: Date = new Date()) => {
    //fall back rather than throw: a bad zone should not stop someone logging a
    //dose. assertValidTimezone guards the write path, this guards the read.
    const zone = isValidTimezone(timezone) ? timezone : DEFAULT_TIMEZONE;

    return new Intl.DateTimeFormat(ISO_DAY, {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(at);
};


//Wall-clock time in a zone, as minutes past midnight. Used to decide which
//dose is due next.
export const minutesInZone = (timezone = DEFAULT_TIMEZONE, at: Date = new Date()) => {
    const zone = isValidTimezone(timezone) ? timezone : DEFAULT_TIMEZONE;

    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: zone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(at);

    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);

    return hour * 60 + minute;
};


//HOW FAR A ZONE IS FROM UTC, in minutes, ON A GIVEN DATE.
//
//Date-specific on purpose. Half the world changes offset twice a year, so
//"Europe/London is +0" is only true for part of it — a reminder scheduled
//with a fixed offset would fire an hour out all summer.
//
//Works by formatting one instant as if it were UTC, then measuring how far that
//reading has drifted from the instant itself. Whatever the gap is, that is the
//offset, DST and historical changes included.
export const utcOffsetMinutes = (timezone = DEFAULT_TIMEZONE, at: Date = new Date()) => {
    const zone = isValidTimezone(timezone) ? timezone : DEFAULT_TIMEZONE;

    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(at);

    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);

    //hour can come back as "24" at midnight in some engines
    const hour = get('hour') % 24;

    const asUtc = Date.UTC(
        get('year'), get('month') - 1, get('day'),
        hour, get('minute'), get('second'),
    );

    //round to the minute: the two readings differ by sub-second noise otherwise
    return Math.round((asUtc - at.getTime()) / 60_000);
};


//Shift a "YYYY-MM-DD" by whole days without ever touching a timezone.
//
//Deliberately built from the numbers rather than by adding milliseconds to a
//Date: adding 24h across a DST boundary lands on the same calendar day or skips
//one entirely, which is how streak counters quietly break twice a year.
export const addDays = (day: string, days: number) => {
    const [y, m, d] = day.split('-').map(Number);

    //UTC arithmetic on a date with no time component is safe — there is no zone
    //involved, we are only using it as a calendar
    const shifted = new Date(Date.UTC(y, m - 1, d + days));

    //toISOString() on an Invalid Date throws a RangeError, which would surface
    //as a crash rather than as anything a caller could act on. Every caller now
    //passes a checked date, so this is a last line rather than a real branch.
    if (Number.isNaN(shifted.getTime())) {
        throw new GraphQLError(`Cannot shift "${day}" — it is not a valid date`, {
            extensions: { code: 'BAD_USER_INPUT' },
        });
    }

    return shifted.toISOString().slice(0, 10);
};


//Whole days between two "YYYY-MM-DD" values. Positive when `to` is later.
export const daysBetween = (from: string, to: string) => {
    const [fy, fm, fd] = from.split('-').map(Number);
    const [ty, tm, td] = to.split('-').map(Number);

    const a = Date.UTC(fy, fm - 1, fd);
    const b = Date.UTC(ty, tm - 1, td);

    return Math.round((b - a) / 86_400_000);
};


//STREAK LENGTH.
//
//How many days in a row, counting back from today, appear in `days`.
//
//A streak survives one missing day only if that day is today — someone who
//logged yesterday but hasn't yet logged today at 9am has not broken anything,
//and telling them they have is the fastest way to lose them.
export const streakLength = (days: Iterable<string>, today: string) => {
    const set = days instanceof Set ? days : new Set(days);

    //start from today if it is logged, otherwise from yesterday
    let cursor = set.has(today) ? today : addDays(today, -1);

    //nothing yesterday either, so there is genuinely no streak
    if (!set.has(cursor)) return 0;

    let length = 0;

    //Bounded rather than `while (set.has(cursor))`. The set is built from a
    //capped query so it cannot really run away, but an unbounded loop whose
    //exit condition depends on database contents is the kind of thing that
    //hangs a request at 3am — and nobody has a streak longer than the set.
    for (let i = 0; i < set.size; i += 1) {
        if (!set.has(cursor)) break;

        length += 1;
        cursor = addDays(cursor, -1);
    }

    return length;
};
