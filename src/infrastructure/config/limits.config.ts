//ROW CAPS ON LIST QUERIES.
//
//No list query is unbounded. A user with a handful of rows notices nothing,
//but one who has logged daily for two years has thousands, and "fetch them
//all" is the query that gets slower every month until it times out in
//production. Capping costs nothing now and means the ceiling is a number we
//chose rather than one we discover.
//
//When a cap is genuinely hit, that is the signal to add cursor pagination —
//not to raise the number.

export const LIMITS = {
  trustedDevices: 50,
  habitLogs: 400,
  checkIns: 400,
  cycles: 200,
} as const;
