import test from 'node:test';
import assert from 'node:assert/strict';
import { trendLine, weeklyChange } from './weight.service.js';
import { addDays } from '../../shared/datetime.js';

const TODAY = '2026-10-03';

test('the trend starts at the first weight and moves a tenth of the way each day', () => {
  const points = trendLine([
    { day: '2026-10-02', kg: 80 },
    { day: '2026-10-01', kg: 70 },
  ]);
  assert.deepEqual(
    points.map((p) => p.day),
    ['2026-10-01', '2026-10-02']
  );
  assert.equal(points[0].trendKg, 70);
  assert.equal(points[1].trendKg, 71);
});

test('a gap of several days moves the trend as far as that many daily steps', () => {
  const [, afterGap] = trendLine([
    { day: '2026-10-01', kg: 70 },
    { day: '2026-10-04', kg: 80 },
  ]);
  //Three days: 1 - 0.9^3 = 0.271 of the way.
  assert.equal(Number(afterGap.trendKg.toFixed(2)), 72.71);
});

test('the trend smooths a one-day spike', () => {
  const logs = Array.from({ length: 10 }, (_, i) => ({ day: addDays(TODAY, i - 9), kg: 70 }));
  logs[5].kg = 73;
  const points = trendLine(logs);
  assert.ok(Math.max(...points.map((p) => p.trendKg)) < 70.31);
});

test('weekly change follows a steady loss of half a kilo a week', () => {
  const logs = Array.from({ length: 28 }, (_, i) => ({
    day: addDays(TODAY, i - 27),
    kg: 80 - (0.5 / 7) * i,
  }));
  const change = weeklyChange(trendLine(logs), TODAY);
  assert.ok(change != null && change < -0.4 && change > -0.55, `got ${change}`);
});

test('weekly change needs three weights over at least a week', () => {
  const two = trendLine([
    { day: addDays(TODAY, -10), kg: 80 },
    { day: TODAY, kg: 79 },
  ]);
  assert.equal(weeklyChange(two, TODAY), null);

  const shortSpan = trendLine([
    { day: addDays(TODAY, -4), kg: 80 },
    { day: addDays(TODAY, -2), kg: 79.5 },
    { day: TODAY, kg: 79 },
  ]);
  assert.equal(weeklyChange(shortSpan, TODAY), null);
});

test('weekly change ignores weights older than 28 days', () => {
  const points = trendLine([
    { day: addDays(TODAY, -60), kg: 90 },
    { day: addDays(TODAY, -14), kg: 80 },
    { day: addDays(TODAY, -7), kg: 80 },
    { day: TODAY, kg: 80 },
  ]).map((p, i) => (i === 0 ? p : { ...p, trendKg: 80 }));
  assert.equal(weeklyChange(points, TODAY), 0);
});
