//DATES, IN THE USER'S TIMEZONE.
//
//The server runs on UTC. Bujumbura is UTC+2. A glass of water logged at 00:30
//local is 22:30 the previous day in UTC — so `new Date().toISOString()` files
//it under yesterday.
//
//NEVER write `new Date().toISOString().slice(0, 10)` anywhere in this app.
//That is the UTC day, not the user's. Use dayInZone instead.

const DAY_MS = 24 * 60 * 60 * 1000;

//The calendar day in a timezone, as YYYY-MM-DD.
export const dayInZone = (instant: Date, timezone: string): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
};

//Minutes since local midnight, for "is this the morning slot" logic.
export const minutesInZone = (instant: Date, timezone: string): number => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(instant);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get('hour') * 60 + get('minute');
};

//Parsed at UTC noon so adding days never lands on a daylight-saving boundary
//and shifts the date by one.
export const addDays = (day: string, count: number): string => {
  const base = new Date(`${day}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + count);
  return base.toISOString().slice(0, 10);
};

export const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY_MS);

//How many days in a row, counting back from today.
export const streakLength = (days: Iterable<string>, today: string): number => {
  const present = new Set(days);
  let count = 0;
  let cursor = today;

  //A streak survives "not done yet today". Without this line every streak
  //reads zero every morning until the user opens the app — demoralising, and
  //wrong.
  if (!present.has(cursor)) cursor = addDays(cursor, -1);

  while (present.has(cursor)) {
    count += 1;
    cursor = addDays(cursor, -1);
  }
  return count;
};

export const minutesFromNow = (minutes: number): Date => new Date(Date.now() + minutes * 60_000);
export const daysFromNow = (days: number): Date => new Date(Date.now() + days * DAY_MS);
export const secondsSince = (instant: Date): number =>
  Math.floor((Date.now() - instant.getTime()) / 1000);
