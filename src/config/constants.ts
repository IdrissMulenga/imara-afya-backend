//ROW CAPS ON LIST QUERIES.
//
//No list query is unbounded. A user with a handful of rows notices nothing,
//but one who has logged daily for two years has thousands, and "fetch them
//all" is the query that gets slower every month until it times out in
//production. Capping costs nothing now and means the ceiling is a number we
//chose rather than one we discover.
//
//When a cap is genuinely being hit, that is the signal to add cursor
//pagination to the schema — not to raise the number.

export const LIMITS = {
  //one row per device, and a person does not own thirty phones
  trustedDevices: 50,
  //one row per day for the daily trackers
  habitLogs: 400,
  checkIns: 400,
  //a full cycle history is tens of rows, not hundreds
  cycles: 200,
} as const;

//How long a list of one-time codes for a single user can grow before the TTL
//index clears it. Used to bound the resend-count lookup window.
export const OTP_LOOKBACK_HOURS = 24;

//Password rules. Enforced server-side even though the app checks too, because
//curl does not run the app.
export const PASSWORD = {
  MIN_LENGTH: 8,
  MAX_LENGTH: 128,
} as const;
