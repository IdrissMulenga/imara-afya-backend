//DATES, ALWAYS IN THE USER'S ZONE.
//
//The server's timezone is never the user's. Bujumbura is UTC+2, the server is
//UTC, and a dose logged at 00:30 local is 22:30 the previous day in UTC — so
//`new Date().toISOString().slice(0, 10)` files it under yesterday. Four
//resolvers in the previous version each grew their own copy of that line
//before it was removed.
//
//Nothing outside this file does date arithmetic. It imports nothing.

const DAY_MS = 24 * 60 * 60 * 1000;

//The calendar day in a given IANA zone, as YYYY-MM-DD.
export const dayInZone = (instant: Date, timezone: string): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
};

//Minutes since local midnight, for "is this dose in the morning slot" logic.
export const minutesInZone = (instant: Date, timezone: string): number => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(instant);

  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return get('hour') * 60 + get('minute');
};

//Calendar arithmetic on YYYY-MM-DD strings. Parsed as UTC noon so that adding
//days never lands on a daylight-saving boundary and shifts the date by one.
export const addDays = (day: string, count: number): string => {
  const base = new Date(`${day}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + count);
  return base.toISOString().slice(0, 10);
};

export const daysBetween = (from: string, to: string): number => {
  const start = Date.parse(`${from}T12:00:00Z`);
  const end = Date.parse(`${to}T12:00:00Z`);
  return Math.round((end - start) / DAY_MS);
};

//The length of the streak ending today, given the set of days something
//happened. Walks backwards from today and stops at the first gap.
export const streakLength = (days: Iterable<string>, today: string): number => {
  const present = new Set(days);
  let count = 0;
  let cursor = today;

  //A streak survives "not yet done today" — otherwise every streak reads zero
  //every morning until the user opens the app, which is demoralising and wrong.
  if (!present.has(cursor)) cursor = addDays(cursor, -1);

  while (present.has(cursor)) {
    count += 1;
    cursor = addDays(cursor, -1);
  }

  return count;
};

export const minutesFromNow = (minutes: number, from = new Date()): Date =>
  new Date(from.getTime() + minutes * 60_000);

export const daysFromNow = (days: number, from = new Date()): Date =>
  new Date(from.getTime() + days * DAY_MS);

export const isPast = (instant: Date, now = new Date()): boolean =>
  instant.getTime() <= now.getTime();

export const secondsSince = (instant: Date, now = new Date()): number =>
  Math.floor((now.getTime() - instant.getTime()) / 1000);

//A timezone string we are willing to store. An invalid one would throw inside
//Intl on every single read afterwards, which turns one bad write into a
//permanently broken account.
export const isValidTimezone = (timezone: string): boolean => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
};
