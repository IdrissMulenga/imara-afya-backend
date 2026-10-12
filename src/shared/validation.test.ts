import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPastTime } from './validation.js';

const NOW = Date.parse('2026-10-06T21:57:00Z');
const minutes = (n: number) => new Date(NOW + n * 60_000).toISOString();

test('a past time is kept as it is', () => {
  assert.equal(checkPastTime(minutes(-30), 7, NOW).toISOString(), minutes(-30));
});

test('a time a few minutes ahead (a fast phone clock) is taken as now', () => {
  assert.equal(checkPastTime(minutes(4), 7, NOW).getTime(), NOW);
});

test('a time further ahead, too old, or not a time is refused', () => {
  for (const raw of [minutes(6), minutes(-8 * 24 * 60), 'yesterday']) {
    assert.throws(
      () => checkPastTime(raw, 7, NOW),
      (error: { extensions?: { reason?: string } }) => error.extensions?.reason === 'INVALID_TIME',
      raw
    );
  }
});
