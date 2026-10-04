import { isValidObjectId } from 'mongoose';
import type { IUser } from '../user/index.js';
import { VitalReading, type IVitalReading } from './vital.model.js';
import { appError, ErrorCode } from '../../shared/errors.js';
import { checkClientId, checkPastTime, cleanText, inRange } from '../../shared/validation.js';
import { addDays, dayInZone } from '../../shared/datetime.js';
import { countOr, mean, roundTo } from '../../shared/numbers.js';
import type {
  Assessment,
  GlucoseContext,
  LogVitalInput,
  PressureAverage,
  VitalAdvice,
  VitalEntry,
  VitalKind,
  VitalSummary,
} from './vital.types.js';

const NOTE_MAX = 200;
//How far back a reading can be dated.
const MAX_BACKDATE_DAYS = 30;
const HISTORY_DEFAULT_DAYS = 30;
const HISTORY_MAX_DAYS = 365;
//Most readings returned by one history query.
const HISTORY_MAX_READINGS = 2_000;
//MongoDB's duplicate key error.
const DUPLICATE_KEY = 11000;

const ADVICE_ORDER: VitalAdvice[] = ['NONE', 'RECHECK', 'SEE_HEALTH_WORKER', 'URGENT'];
const mostSerious = (...advice: VitalAdvice[]): VitalAdvice =>
  advice.reduce((worst, next) =>
    ADVICE_ORDER.indexOf(next) > ADVICE_ORDER.indexOf(worst) ? next : worst
  );

//Blood pressure in mmHg, by the International Society of Hypertension 2020 categories; a
//reading falls in the higher category of its two numbers. Under 90/60 is low.
export const assessPressure = (systolic: number, diastolic: number): Assessment => {
  if (systolic >= 180 || diastolic >= 110) return { category: 'SEVERE', advice: 'URGENT' };
  if (systolic >= 160 || diastolic >= 100) {
    return { category: 'HIGH_GRADE_2', advice: 'SEE_HEALTH_WORKER' };
  }
  if (systolic >= 140 || diastolic >= 90) return { category: 'HIGH_GRADE_1', advice: 'RECHECK' };
  if (systolic >= 130 || diastolic >= 85) return { category: 'HIGH_NORMAL', advice: 'NONE' };
  if (systolic < 90 || diastolic < 60) return { category: 'LOW', advice: 'RECHECK' };
  return { category: 'NORMAL', advice: 'NONE' };
};

//Blood glucose in mmol/L. Fasting: 5.6-6.9 raised, 7.0 and over high. About two hours after a
//meal: 7.8-11.0 raised, 11.1 and over high. Random: 11.1 and over high. Under 3.9 is low and
//under 3.0 very low; 16.7 and over is very high, whatever the context.
export const assessGlucose = (mmol: number, context: GlucoseContext): Assessment => {
  if (mmol < 3.0) return { category: 'VERY_LOW', advice: 'URGENT' };
  if (mmol < 3.9) return { category: 'LOW', advice: 'RECHECK' };
  if (mmol >= 16.7) return { category: 'VERY_HIGH', advice: 'URGENT' };
  const [raisedFrom, highFrom] =
    context === 'FASTING' ? [5.6, 7.0] : context === 'AFTER_MEAL' ? [7.8, 11.1] : [11.1, 11.1];
  if (mmol >= highFrom) return { category: 'HIGH', advice: 'SEE_HEALTH_WORKER' };
  if (mmol >= raisedFrom) return { category: 'RAISED', advice: 'RECHECK' };
  return { category: 'NORMAL', advice: 'NONE' };
};

//Resting pulse in beats per minute: 50-100 normal; 40-49 low, which is normal for some fit
//people; under 40 very low; 101-120 high; over 120 very high.
export const assessPulse = (bpm: number): Assessment => {
  if (bpm < 40) return { category: 'VERY_LOW', advice: 'SEE_HEALTH_WORKER' };
  if (bpm < 50) return { category: 'LOW', advice: 'NONE' };
  if (bpm > 120) return { category: 'VERY_HIGH', advice: 'SEE_HEALTH_WORKER' };
  if (bpm > 100) return { category: 'HIGH', advice: 'RECHECK' };
  return { category: 'NORMAL', advice: 'NONE' };
};

type Stored = Pick<
  IVitalReading,
  | '_id'
  | 'kind'
  | 'at'
  | 'day'
  | 'systolic'
  | 'diastolic'
  | 'pulse'
  | 'glucoseMmol'
  | 'glucoseContext'
  | 'note'
>;

//A stored reading with its category and advice.
export const toEntry = (reading: Stored): VitalEntry => {
  const pulse = reading.pulse != null ? assessPulse(reading.pulse) : null;
  const main =
    reading.kind === 'BLOOD_PRESSURE'
      ? assessPressure(reading.systolic ?? 0, reading.diastolic ?? 0)
      : reading.kind === 'GLUCOSE'
        ? assessGlucose(reading.glucoseMmol ?? 0, reading.glucoseContext ?? 'RANDOM')
        : (pulse ?? { category: 'NORMAL', advice: 'NONE' });

  return {
    id: String(reading._id),
    kind: reading.kind,
    day: reading.day,
    at: reading.at.toISOString(),
    systolic: reading.systolic,
    diastolic: reading.diastolic,
    pulse: reading.pulse,
    glucoseMmol: reading.glucoseMmol,
    glucoseContext: reading.glucoseContext,
    note: reading.note ?? '',
    category: main.category,
    pulseCategory: pulse?.category ?? null,
    advice: mostSerious(main.advice, pulse?.advice ?? 'NONE'),
  };
};

const missing = (message: string) =>
  appError(ErrorCode.BAD_USER_INPUT, message, { reason: 'VITAL_INCOMPLETE' });

//The checked values for a reading of `kind`; values that do not belong to the kind are dropped.
const checkValues = (input: LogVitalInput) => {
  const pulse = (value: number) => Math.round(inRange(value, 25, 250, 'pulse'));

  if (input.kind === 'BLOOD_PRESSURE') {
    if (input.systolic == null || input.diastolic == null) {
      throw missing('Blood pressure needs both numbers.');
    }
    const systolic = Math.round(inRange(input.systolic, 50, 300, 'systolic'));
    const diastolic = Math.round(inRange(input.diastolic, 30, 200, 'diastolic'));
    if (diastolic >= systolic) {
      throw appError(
        ErrorCode.BAD_USER_INPUT,
        'The top number must be higher than the bottom number.',
        { reason: 'PRESSURE_ORDER' }
      );
    }
    return {
      systolic,
      diastolic,
      pulse: input.pulse != null ? pulse(input.pulse) : null,
      glucoseMmol: null,
      glucoseContext: null,
    };
  }

  if (input.kind === 'GLUCOSE') {
    if (input.glucoseMmol == null || input.glucoseContext == null) {
      throw missing('Blood sugar needs a value and when it was measured.');
    }
    return {
      systolic: null,
      diastolic: null,
      pulse: null,
      glucoseMmol: roundTo(inRange(input.glucoseMmol, 1, 40, 'glucose'), 1),
      glucoseContext: input.glucoseContext,
    };
  }

  if (input.pulse == null) throw missing('A pulse reading needs the beats per minute.');
  return {
    systolic: null,
    diastolic: null,
    pulse: pulse(input.pulse),
    glucoseMmol: null,
    glucoseContext: null,
  };
};

const FIELDS = 'kind at day systolic diastolic pulse glucoseMmol glucoseContext note';

//The reading already saved with this client id, if any.
const findByClientId = (user: IUser, clientId: string) =>
  VitalReading.findOne({ user: user._id, clientId }).select(FIELDS).lean<Stored | null>();

//Saves one reading and returns it with its category and advice. A client id already used
//returns the reading saved with it.
export const logVital = async (user: IUser, input: LogVitalInput): Promise<VitalEntry> => {
  const values = checkValues(input);
  const at = input.at != null ? checkPastTime(input.at, MAX_BACKDATE_DAYS) : new Date();
  const note = input.note != null ? cleanText(input.note, NOTE_MAX, 'note') : '';
  const clientId = input.clientId != null ? checkClientId(input.clientId) : null;

  if (clientId) {
    const existing = await findByClientId(user, clientId);
    if (existing) return toEntry(existing);
  }

  try {
    const saved = await VitalReading.create({
      user: user._id,
      kind: input.kind,
      at,
      day: dayInZone(at, user.timezone),
      note,
      ...values,
      ...(clientId ? { clientId } : {}),
    });
    return toEntry(saved);
  } catch (error) {
    //The same reading sent twice at once: return the one that was saved.
    if (clientId && (error as { code?: number }).code === DUPLICATE_KEY) {
      const existing = await findByClientId(user, clientId);
      if (existing) return toEntry(existing);
    }
    throw error;
  }
};

//Removes one reading. Returns false if there was none.
export const deleteVital = async (user: IUser, id: string): Promise<boolean> => {
  if (!isValidObjectId(id)) return false;
  const result = await VitalReading.deleteOne({ _id: id, user: user._id });
  return result.deletedCount > 0;
};

//Readings in the last `days` days, newest first; one kind, or all.
export const getHistory = async (
  user: IUser,
  days?: number | null,
  kind?: VitalKind | null
): Promise<VitalEntry[]> => {
  const count = countOr(days, HISTORY_DEFAULT_DAYS, HISTORY_MAX_DAYS);
  const oldest = addDays(dayInZone(new Date(), user.timezone), -(count - 1));
  const readings = await VitalReading.find({
    user: user._id,
    day: { $gte: oldest },
    ...(kind ? { kind } : {}),
  })
    .select(FIELDS)
    .sort({ at: -1 })
    .limit(HISTORY_MAX_READINGS)
    .lean<Stored[]>();
  return readings.map(toEntry);
};

//The average blood pressure over the readings from `oldest` on.
export const averagePressure = (
  readings: Stored[],
  days: number,
  oldest: string
): PressureAverage => {
  const recent = readings.filter(
    (r) =>
      r.kind === 'BLOOD_PRESSURE' && r.day >= oldest && r.systolic != null && r.diastolic != null
  );
  if (!recent.length) return { days, readings: 0, systolic: null, diastolic: null, category: null };
  const systolic = Math.round(mean(recent.map((r) => r.systolic as number)));
  const diastolic = Math.round(mean(recent.map((r) => r.diastolic as number)));
  return {
    days,
    readings: recent.length,
    systolic,
    diastolic,
    category: assessPressure(systolic, diastolic).category,
  };
};

//The newest reading of each measure, and the average blood pressure over 7 and 30 days.
export const getSummary = async (user: IUser): Promise<VitalSummary> => {
  const today = dayInZone(new Date(), user.timezone);
  const mine = { user: user._id };
  const newest = (filter: object) =>
    VitalReading.findOne({ ...mine, ...filter })
      .select(FIELDS)
      .sort({ at: -1 })
      .lean<Stored>();

  const [pressure, glucose, pulse, month] = await Promise.all([
    newest({ kind: 'BLOOD_PRESSURE' }),
    newest({ kind: 'GLUCOSE' }),
    newest({ pulse: { $ne: null } }),
    VitalReading.find({ ...mine, kind: 'BLOOD_PRESSURE', day: { $gte: addDays(today, -29) } })
      .select(FIELDS)
      .sort({ at: -1 })
      .limit(HISTORY_MAX_READINGS)
      .lean<Stored[]>(),
  ]);

  return {
    latestPressure: pressure ? toEntry(pressure) : null,
    latestGlucose: glucose ? toEntry(glucose) : null,
    latestPulse: pulse ? toEntry(pulse) : null,
    pressureWeek: averagePressure(month, 7, addDays(today, -6)),
    pressureMonth: averagePressure(month, 30, addDays(today, -29)),
  };
};
