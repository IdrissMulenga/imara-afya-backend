//HOW MANY ROWS A SINGLE QUERY MAY RETURN.
//
//No list query should be unbounded. Today a user has a handful of records and
//it makes no difference — but a user who has logged doses daily for two years
//has ~1,500 rows, and "fetch them all" is the query that quietly gets slower
//every month until it times out. Capping now costs nothing and means the
//ceiling is a number we chose rather than one we discover in production.
//
//When these caps start being hit for real, that's the signal to add proper
//cursor pagination to the schema rather than to raise the numbers.
export const LIMITS = {
    //personal records — a user realistically has tens, not hundreds
    healthRecords: 200,
    medications: 100,
    //one row per dose; the app only ever renders a day or two at a time
    medicationLogs: 200,
    cycles: 200,
    pregnancies: 50,
    habitLogs: 200,
    //shared directories, read by everyone
    hospitals: 300,
    guidance: 200,
} as const;
