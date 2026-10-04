import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAchievements, personalBest, streakStats } from './achievement.service.js';
import type { AchievementGoals, HabitDay } from './achievement.types.js';
import { addDays } from '../../shared/datetime.js';

const START = '2026-09-01';
const goals: AchievementGoals = {
  water: 8,
  steps: 8000,
  sleep: 7,
  weightKg: null,
  weightGoalKg: null,
};
const days = (from: string, count: number) =>
  Array.from({ length: count }, (_, i) => addDays(from, i));
const habit = (day: string, values: Partial<HabitDay> = {}): HabitDay => ({
  day,
  waterGlasses: 0,
  steps: null,
  sleepHours: null,
  ...values,
});

test('streak stats find the longest run and the day each length was first reached', () => {
  const run = [...days(START, 3), ...days('2026-09-10', 8)];
  const { best, reachedOn } = streakStats(run, [7, 30]);
  assert.equal(best, 8);
  assert.equal(reachedOn.get(7), '2026-09-16');
  assert.equal(reachedOn.has(30), false);
});

test('streak stats ignore duplicates and order, and cross month ends', () => {
  const { best } = streakStats(['2026-10-02', '2026-09-30', '2026-10-01', '2026-10-01'], []);
  assert.equal(best, 3);
});

test('personal best is the highest value, earliest on a tie, ignoring zeros and missing', () => {
  const habits = [
    habit('2026-09-03', { steps: 9000 }),
    habit('2026-09-01', { steps: 9000 }),
    habit('2026-09-02', { steps: 0 }),
    habit('2026-09-04'),
  ];
  assert.deepEqual(
    personalBest(habits, (h) => h.steps),
    { value: 9000, day: '2026-09-01' }
  );
  assert.equal(
    personalBest([habit('2026-09-01')], (h) => h.steps),
    null
  );
});

test('water badges follow the goal; progress stops at the target', () => {
  const habits = days(START, 10).map((day) => habit(day, { waterGlasses: 8 }));
  const result = buildAchievements(habits, [], goals);
  const water7 = result.badges.find((b) => b.id === 'WATER_7')!;
  const water30 = result.badges.find((b) => b.id === 'WATER_30')!;
  assert.deepEqual([water7.earned, water7.progress, water7.earnedOn], [true, 7, '2026-09-07']);
  assert.deepEqual([water30.earned, water30.progress, water30.earnedOn], [false, 10, null]);
  assert.equal(result.longestStreaks.water, 10);
});

test('a day under the goal breaks the streak', () => {
  const habits = days(START, 10).map((day, i) => habit(day, { waterGlasses: i === 5 ? 7 : 8 }));
  assert.equal(buildAchievements(habits, [], goals).longestStreaks.water, 5);
});

test('unsynced steps (null or 0) never count toward a steps streak', () => {
  const habits = days(START, 7).map((day) => habit(day, { steps: 0 }));
  const steps7 = buildAchievements(habits, [], { ...goals, steps: 0 }).badges.find(
    (b) => b.id === 'STEPS_7'
  )!;
  assert.equal(steps7.earned, false);
});

test('first check-in, first week and the weight goal', () => {
  const checkIns = ['2026-09-05', '2026-09-02'];
  const habits = days('2026-09-10', 5).map((day) => habit(day, { sleepHours: 6 }));
  const result = buildAchievements(habits, checkIns, {
    ...goals,
    weightKg: 70.3,
    weightGoalKg: 70,
  });
  const byId = Object.fromEntries(result.badges.map((b) => [b.id, b]));
  assert.deepEqual([byId.FIRST_CHECKIN.earned, byId.FIRST_CHECKIN.earnedOn], [true, '2026-09-02']);
  assert.deepEqual([byId.FIRST_WEEK.earned, byId.FIRST_WEEK.earnedOn], [true, '2026-09-14']);
  assert.equal(byId.WEIGHT_GOAL.earned, true);
  assert.equal(result.earnedCount, 3);

  const noGoal = buildAchievements([], [], goals);
  assert.equal(noGoal.badges.find((b) => b.id === 'WEIGHT_GOAL')!.earned, false);
  assert.equal(noGoal.earnedCount, 0);
  assert.equal(noGoal.badges.length, 14);
});
