import test from 'node:test';
import assert from 'node:assert/strict';
import { canCreateCheckIn, isWithinDeleteWindow } from './checkin.service.js';

test('daily cap rejects any request once the limit has been reached', () => {
  assert.equal(canCreateCheckIn(9, 10), true);
  assert.equal(canCreateCheckIn(10, 10), false);
  assert.equal(canCreateCheckIn(11, 10), false);
});

test('delete window uses real age, not only the calendar day string', () => {
  const now = new Date('2026-09-30T12:00:00Z');
  const recent = new Date('2026-09-15T10:00:00Z');
  const old = new Date('2026-08-20T12:00:00Z');

  assert.equal(isWithinDeleteWindow(recent, now, 30), true);
  assert.equal(isWithinDeleteWindow(old, now, 30), false);
});
