import test from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import {
  assessGlucose,
  assessPressure,
  assessPulse,
  averagePressure,
  toEntry,
} from './vital.service.js';

const pressure = (s: number, d: number) => {
  const { category, advice } = assessPressure(s, d);
  return `${category}/${advice}`;
};

test('blood pressure follows the ISH 2020 categories at each boundary', () => {
  assert.equal(pressure(118, 76), 'NORMAL/NONE');
  assert.equal(pressure(129, 84), 'NORMAL/NONE');
  assert.equal(pressure(130, 70), 'HIGH_NORMAL/NONE');
  assert.equal(pressure(120, 85), 'HIGH_NORMAL/NONE');
  assert.equal(pressure(139, 89), 'HIGH_NORMAL/NONE');
  assert.equal(pressure(140, 80), 'HIGH_GRADE_1/RECHECK');
  assert.equal(pressure(125, 90), 'HIGH_GRADE_1/RECHECK');
  assert.equal(pressure(159, 99), 'HIGH_GRADE_1/RECHECK');
  assert.equal(pressure(160, 80), 'HIGH_GRADE_2/SEE_HEALTH_WORKER');
  assert.equal(pressure(130, 100), 'HIGH_GRADE_2/SEE_HEALTH_WORKER');
  assert.equal(pressure(179, 109), 'HIGH_GRADE_2/SEE_HEALTH_WORKER');
  assert.equal(pressure(180, 90), 'SEVERE/URGENT');
  assert.equal(pressure(150, 110), 'SEVERE/URGENT');
});

test('the higher of the two numbers decides, and high wins over low', () => {
  assert.equal(pressure(150, 55), 'HIGH_GRADE_1/RECHECK');
  assert.equal(pressure(185, 58), 'SEVERE/URGENT');
});

test('low blood pressure is under 90 or under 60', () => {
  assert.equal(pressure(89, 70), 'LOW/RECHECK');
  assert.equal(pressure(100, 59), 'LOW/RECHECK');
  assert.equal(pressure(90, 60), 'NORMAL/NONE');
});

const glucose = (mmol: number, context: 'FASTING' | 'AFTER_MEAL' | 'RANDOM') => {
  const { category, advice } = assessGlucose(mmol, context);
  return `${category}/${advice}`;
};

test('glucose: very low and low come first, whatever the context', () => {
  assert.equal(glucose(2.9, 'AFTER_MEAL'), 'VERY_LOW/URGENT');
  assert.equal(glucose(3.0, 'FASTING'), 'LOW/RECHECK');
  assert.equal(glucose(3.8, 'RANDOM'), 'LOW/RECHECK');
  assert.equal(glucose(3.9, 'FASTING'), 'NORMAL/NONE');
});

test('glucose: fasting, after a meal and random thresholds', () => {
  assert.equal(glucose(5.5, 'FASTING'), 'NORMAL/NONE');
  assert.equal(glucose(5.6, 'FASTING'), 'RAISED/RECHECK');
  assert.equal(glucose(6.9, 'FASTING'), 'RAISED/RECHECK');
  assert.equal(glucose(7.0, 'FASTING'), 'HIGH/SEE_HEALTH_WORKER');

  assert.equal(glucose(7.7, 'AFTER_MEAL'), 'NORMAL/NONE');
  assert.equal(glucose(7.8, 'AFTER_MEAL'), 'RAISED/RECHECK');
  assert.equal(glucose(11.0, 'AFTER_MEAL'), 'RAISED/RECHECK');
  assert.equal(glucose(11.1, 'AFTER_MEAL'), 'HIGH/SEE_HEALTH_WORKER');

  assert.equal(glucose(9.0, 'RANDOM'), 'NORMAL/NONE');
  assert.equal(glucose(11.1, 'RANDOM'), 'HIGH/SEE_HEALTH_WORKER');
});

test('glucose of 16.7 or more is very high and urgent in every context', () => {
  for (const context of ['FASTING', 'AFTER_MEAL', 'RANDOM'] as const) {
    assert.equal(glucose(16.6, context), 'HIGH/SEE_HEALTH_WORKER');
    assert.equal(glucose(16.7, context), 'VERY_HIGH/URGENT');
  }
});

test('resting pulse', () => {
  const pulse = (bpm: number) => `${assessPulse(bpm).category}/${assessPulse(bpm).advice}`;
  assert.equal(pulse(39), 'VERY_LOW/SEE_HEALTH_WORKER');
  assert.equal(pulse(40), 'LOW/NONE');
  assert.equal(pulse(49), 'LOW/NONE');
  assert.equal(pulse(50), 'NORMAL/NONE');
  assert.equal(pulse(100), 'NORMAL/NONE');
  assert.equal(pulse(101), 'HIGH/RECHECK');
  assert.equal(pulse(120), 'HIGH/RECHECK');
  assert.equal(pulse(121), 'VERY_HIGH/SEE_HEALTH_WORKER');
});

const reading = (values: Record<string, unknown>) =>
  toEntry({
    _id: new Types.ObjectId(),
    kind: 'BLOOD_PRESSURE',
    at: new Date('2026-10-04T08:00:00Z'),
    day: '2026-10-04',
    systolic: null,
    diastolic: null,
    pulse: null,
    glucoseMmol: null,
    glucoseContext: null,
    note: '',
    ...values,
  } as Parameters<typeof toEntry>[0]);

test('a reading takes the most serious advice of its blood pressure and its pulse', () => {
  const calmPressureFastPulse = reading({ systolic: 118, diastolic: 76, pulse: 130 });
  assert.equal(calmPressureFastPulse.category, 'NORMAL');
  assert.equal(calmPressureFastPulse.pulseCategory, 'VERY_HIGH');
  assert.equal(calmPressureFastPulse.advice, 'SEE_HEALTH_WORKER');

  const severeNoPulse = reading({ systolic: 182, diastolic: 112 });
  assert.equal(severeNoPulse.pulseCategory, null);
  assert.equal(severeNoPulse.advice, 'URGENT');
});

test('average blood pressure uses only readings in the window', () => {
  const rows = [
    { day: '2026-10-04', systolic: 150, diastolic: 95 },
    { day: '2026-10-01', systolic: 130, diastolic: 85 },
    { day: '2026-09-20', systolic: 180, diastolic: 110 },
  ].map((r) => ({ ...r, kind: 'BLOOD_PRESSURE' })) as Parameters<typeof averagePressure>[0];
  const week = averagePressure(rows, 7, '2026-09-28');
  assert.deepEqual(
    [week.readings, week.systolic, week.diastolic, week.category],
    [2, 140, 90, 'HIGH_GRADE_1']
  );
  const none = averagePressure([], 7, '2026-09-28');
  assert.deepEqual([none.readings, none.systolic, none.category], [0, null, null]);
});
