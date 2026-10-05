import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInsights,
  dailyMoods,
  explainedBy,
  findPatterns,
  heldFixedGap,
  summarizeSleep,
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

test('difference always equals the two averages shown', () => {
  //Unrounded means are 4.04 and 3.46: a 0.58 gap, shown as 4.0 and 3.5.
  const scores = [4, 4, 4, 4, 4.2, 3.5, 3.5, 3.5, 3.5, 3.3];
  const { habits, moods } = series(10, (i) => ({
    habit: { sleepHours: i < 5 ? 8 : 5 },
    mood: scores[i],
  }));

  const [pattern] = findPatterns(habits, moods, goals);
  assert.equal(pattern.goalMetAverage, 4);
  assert.equal(pattern.goalMissedAverage, 3.5);
  assert.equal(pattern.difference, 0.5);
});

test('days the band was not worn (0 steps, 0 sleep) are left out', () => {
  const habits: HabitValues[] = [];
  for (let i = 0; i < 7; i += 1) {
    const worn = i >= 3;
    habits.push(
      habit(addDays(TODAY, -i), worn ? { steps: 9000, sleepHours: 8 } : { steps: 0, sleepHours: 0 })
    );
  }

  const period = summarizePeriod(habits, [], goals, addDays(TODAY, -6), TODAY);
  assert.equal(period.steps, 9000);
  assert.equal(period.sleepHours, 8);
  assert.equal(period.stepGoalDays, 4);
  assert.equal(period.sleepGoalDays, 4);
});

test('a pattern is kept when the stronger habit was logged on too few of the same days', () => {
  //Water logged for 12 days; the band only arrived for the last 2.
  const water = Array.from({ length: 12 }, (_, i) => ({
    day: addDays(TODAY, -i),
    met: i % 2 === 0,
    score: i % 2 === 0 ? 4 : 2,
  }));
  const sleep = water.slice(0, 2).map((sample) => ({ ...sample, score: 5 }));

  assert.equal(heldFixedGap(water, sleep), null);
  assert.equal(explainedBy(water, 2, sleep), false);
});

test('sleep summary: usual night, regularity and this week’s debt', () => {
  const steady = series(14, () => ({ habit: { sleepHours: 7 }, mood: 3 })).habits;
  const s1 = summarizeSleep(steady, 8, TODAY);
  assert.equal(s1.nights, 14);
  assert.equal(s1.usualHours, 7);
  assert.equal(s1.regularity, 'STEADY');
  assert.equal(s1.debtHours, 7);

  const swinging = series(14, (i) => ({ habit: { sleepHours: i % 2 ? 4 : 9 }, mood: 3 })).habits;
  assert.equal(summarizeSleep(swinging, 8, TODAY).regularity, 'IRREGULAR');

  const few = series(3, () => ({ habit: { sleepHours: 7 }, mood: 3 })).habits;
  const s3 = summarizeSleep(few, 8, TODAY);
  assert.equal(s3.regularity, 'UNKNOWN');
  assert.equal(s3.variationHours, null);
});

test('nights not recorded are left out of the sleep summary, and debt never goes negative', () => {
  const habits = series(7, (i) => ({ habit: { sleepHours: i < 3 ? 9 : null }, mood: 3 })).habits;
  const s = summarizeSleep(habits, 8, TODAY);
  assert.equal(s.nights, 3);
  assert.equal(s.debtHours, 0);
});

test('mood after regular nights is compared with irregular ones', () => {
  //Usual sleep 7 h; regular nights (6.5-7.5 h) go with mood 4, irregular ones (4 or 10 h) with 2.
  const hours = [7, 7.2, 6.8, 7, 7.1, 6.9, 7, 4, 10, 4, 10, 4];
  const { habits, moods } = series(12, (i) => ({
    habit: { sleepHours: hours[i] },
    mood: Math.abs(hours[i] - 7) <= 1 ? 4 : 2,
  }));
  const pattern = findPatterns(habits, moods, goals).find((p) => p.factor === 'REGULAR_SLEEP');
  assert.ok(pattern, 'expected a REGULAR_SLEEP pattern');
  assert.equal(pattern.outcome, 'MOOD');
  assert.equal(pattern.goalMetAverage, 4);
  assert.equal(pattern.goalMissedAverage, 2);
});

test('nights estimated from the sleep schedule are left out of sleep insights', () => {
  //Ten identical estimated nights, and three real ones that vary a lot.
  const habits = [
    ...series(10, () => ({ habit: { sleepHours: 8.5, sleepSource: 'ESTIMATE' }, mood: 3 })).habits,
    habit(addDays(TODAY, -11), { sleepHours: 4 }),
    habit(addDays(TODAY, -12), { sleepHours: 9 }),
    habit(addDays(TODAY, -13), { sleepHours: 5 }),
  ];
  const s = summarizeSleep(habits, 8, TODAY);
  assert.equal(s.nights, 3);
  assert.equal(s.weekNights, 0);
  assert.equal(s.regularity, 'UNKNOWN');
  assert.equal(s.debtHours, 0);
});
