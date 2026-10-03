import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInsights,
  dailyMoods,
  findPatterns,
  heldFixedGap,
  summarizePeriod,
  welchT,
} from './insight.service.js';
import type { Goals, HabitValues, MoodValues } from './insight.types.js';
import { addDays } from '../../shared/datetime.js';

const goals: Goals = { water: 8, steps: 8000, sleep: 7 };
const TODAY = '2026-10-03';

const habit = (day: string, values: Partial<HabitValues> = {}): HabitValues => ({
  day,
  waterGlasses: 0,
  steps: null,
  sleepHours: null,
  ...values,
});

test('daily moods average several check-ins on the same day', () => {
  const days = dailyMoods([
    { day: TODAY, mood: 2, energy: 4 },
    { day: TODAY, mood: 4, energy: 2 },
    { day: '2026-10-02', mood: 5, energy: 5 },
  ]);
  assert.deepEqual(
    days.find((d) => d.day === TODAY),
    { day: TODAY, mood: 3, energy: 3 }
  );
  assert.equal(days.length, 2);
});

test('a period leaves out unsynced and unlogged values instead of counting them as zero', () => {
  const period = summarizePeriod(
    [
      habit('2026-10-01', { waterGlasses: 8, steps: 9000, sleepHours: 6 }),
      habit('2026-10-02', { waterGlasses: 0, steps: null, sleepHours: 8 }),
      habit('2026-09-20', { waterGlasses: 20 }),
    ],
    [],
    goals,
    '2026-09-27',
    TODAY
  );
  assert.equal(period.waterGlasses, 8);
  assert.equal(period.steps, 9000);
  assert.equal(period.sleepHours, 7);
  assert.equal(period.waterGoalDays, 1);
  assert.equal(period.stepGoalDays, 1);
  assert.equal(period.sleepGoalDays, 1);
  assert.equal(period.mood, null);
  assert.equal(period.checkInDays, 0);
});

//Builds `count` days ending TODAY from a function of the day's index.
const series = (
  count: number,
  build: (i: number) => { habit: Partial<HabitValues>; mood: number; energy?: number }
) => {
  const habits: HabitValues[] = [];
  const moods: MoodValues[] = [];
  for (let i = 0; i < count; i += 1) {
    const day = addDays(TODAY, -i);
    const { habit: values, mood, energy = 3 } = build(i);
    habits.push(habit(day, values));
    moods.push({ day, mood, energy });
  }
  return { habits, moods };
};

test('a pattern compares mood on goal-met and goal-missed days', () => {
  const { habits, moods } = series(10, (i) => ({
    habit: { sleepHours: i % 2 ? 5 : 8 },
    mood: i % 2 ? 2 : 4,
  }));

  assert.deepEqual(findPatterns(habits, moods, goals), [
    {
      factor: 'SLEEP',
      outcome: 'MOOD',
      goalMetAverage: 4,
      goalMissedAverage: 2,
      goalMetDays: 5,
      goalMissedDays: 5,
      difference: 2,
    },
  ]);
});

test('no pattern with fewer than five days on a side', () => {
  const { habits, moods } = series(8, (i) => ({
    habit: { sleepHours: i % 2 ? 5 : 8 },
    mood: i % 2 ? 1 : 5,
  }));
  assert.deepEqual(findPatterns(habits, moods, goals), []);
});

test('no pattern when the gap is under 0.5', () => {
  const { habits, moods } = series(12, (i) => ({
    habit: { sleepHours: i % 2 ? 5 : 8 },
    mood: i % 2 ? 3 : 3.4,
  }));
  assert.deepEqual(findPatterns(habits, moods, goals), []);
});

test('no pattern when the gap is within day-to-day noise', () => {
  //Met-goal days average 3.6, missed 3.0, but both swing between 1 and 5.
  const met = [5, 1, 5, 2, 5];
  const missed = [1, 5, 1, 5, 3];
  const { habits, moods } = series(10, (i) => ({
    habit: { sleepHours: i < 5 ? 8 : 5 },
    mood: i < 5 ? met[i] : missed[i - 5],
  }));
  assert.equal(welchT(met, missed) < 2, true);
  assert.deepEqual(findPatterns(habits, moods, goals), []);
});

test('a habit that only rides along with a stronger one is dropped', () => {
  //Mood follows sleep alone; water goals happen to fall mostly on good-sleep days.
  const { habits, moods } = series(12, (i) => {
    const slept = i < 6;
    const drank = slept ? i !== 5 : i === 6;
    return {
      habit: { sleepHours: slept ? 8 : 5, waterGlasses: drank ? 8 : 3 },
      mood: slept ? 4 : 2,
    };
  });

  const patterns = findPatterns(habits, moods, goals);
  assert.deepEqual(
    patterns.map((p) => p.factor),
    ['SLEEP']
  );
});

test('a habit with its own effect is kept alongside a stronger one', () => {
  //Mood rises 2 with sleep and 1 with water, and the two goals are met independently.
  const { habits, moods } = series(24, (i) => {
    const slept = i < 12;
    const drank = i % 2 === 0;
    return {
      habit: { sleepHours: slept ? 8 : 5, waterGlasses: drank ? 8 : 3 },
      mood: (slept ? 2 : 0) + (drank ? 1 : 0) + 2,
    };
  });

  const patterns = findPatterns(habits, moods, goals);
  assert.deepEqual(
    patterns.map((p) => [p.factor, p.difference]),
    [
      ['SLEEP', 2],
      ['WATER', 1],
    ]
  );
});

test('held-fixed gap is null when the two habits never separate', () => {
  const candidate = [
    { day: 'a', met: true, score: 4 },
    { day: 'b', met: false, score: 2 },
  ];
  assert.equal(heldFixedGap(candidate, candidate), null);
});

test('this week and last week are consecutive seven-day periods ending today', () => {
  const insights = buildInsights([], [], goals, TODAY, 30);
  assert.equal(insights.thisWeek.start, '2026-09-27');
  assert.equal(insights.thisWeek.end, TODAY);
  assert.equal(insights.lastWeek.start, '2026-09-20');
  assert.equal(insights.lastWeek.end, '2026-09-26');
  assert.deepEqual(insights.patterns, []);
});
