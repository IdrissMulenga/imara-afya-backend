//Number helpers shared by the services.

//Rounds to a number of decimal places.
export const roundTo = (value: number, places: number): number => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

//Average of the values (0 for none).
export const mean = (values: number[]): number =>
  values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;

//Middle value, rounded to a whole number; fallback when there are none.
export const median = (values: number[], fallback: number): number => {
  if (!values.length) return fallback;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return Math.round(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2);
};

//A count argument such as "last N days": fallback when missing, else a whole number 1..max.
export const countOr = (value: number | null | undefined, fallback: number, max: number): number =>
  value == null || !Number.isFinite(value)
    ? fallback
    : Math.min(max, Math.max(1, Math.floor(value)));
