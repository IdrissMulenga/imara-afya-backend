import type { IUser } from './user.model.js';
import { Device, sendDataExportEmail } from '../auth/index.js';
import { HabitLog } from '../habit/index.js';
import { CheckIn } from '../checkin/index.js';
import { CycleDay, CyclePeriod } from '../cycle/index.js';
import { Band } from '../band/index.js';
import { WeightLog } from '../weight/index.js';
import { VitalReading } from '../vital/index.js';
import { appError, ErrorCode } from '../../shared/errors.js';
import { dayInZone } from '../../shared/datetime.js';

//Rows per collection: decades of daily entries, and ten check-ins a day for years.
const MAX_ROWS = 50_000;
const iso = (date: Date | null | undefined): string | null => (date ? date.toISOString() : null);

//Everything the app stores about the user, with only the fields that are theirs: no password or
//device secret hashes, codes, or internal counters. Each section names its fields, so a field
//added to a model later is left out until it is added here.
export const buildExport = async (user: IUser) => {
  const mine = { user: user._id };
  const [habits, checkIns, periods, cycleDays, weights, band, devices, vitals] = await Promise.all([
    HabitLog.find(mine)
      .select('day waterGlasses steps sleepHours stepsSource sleepSource')
      .sort({ day: 1 })
      .limit(MAX_ROWS)
      .lean(),
    CheckIn.find(mine)
      .select('day at mood energy note createdAt')
      .sort({ day: 1 })
      .limit(MAX_ROWS)
      .lean(),
    CyclePeriod.find(mine).select('start end').sort({ start: 1 }).limit(MAX_ROWS).lean(),
    CycleDay.find(mine)
      .select('day flow symptoms discharge note')
      .sort({ day: 1 })
      .limit(MAX_ROWS)
      .lean(),
    WeightLog.find(mine).select('day kg').sort({ day: 1 }).limit(MAX_ROWS).lean(),
    Band.findOne(mine).select('bandId bandModel firmware pairedAt lastSyncedAt').lean(),
    Device.find(mine)
      .select('label lastSeenAt createdAt')
      .sort({ lastSeenAt: -1 })
      .limit(MAX_ROWS)
      .lean<{ label: string; lastSeenAt: Date; createdAt?: Date }[]>(),
    VitalReading.find(mine)
      .select('kind at day systolic diastolic pulse glucoseMmol glucoseContext note')
      .sort({ at: 1 })
      .limit(MAX_ROWS)
      .lean(),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    app: 'Imara Afya',
    profile: {
      email: user.email,
      emailVerified: user.emailVerified,
      name: user.name,
      photoUrl: user.photoUrl || null,
      gender: user.gender,
      birthDate: iso(user.birthDate)?.slice(0, 10) ?? null,
      heightCm: user.heightCm,
      weightKg: user.weightKg,
      language: user.language,
      units: user.units,
      timezone: user.timezone,
      cycleTrackingEnabled: user.cycleTrackingEnabled,
      goals: {
        waterGlasses: user.waterGoalGlasses,
        steps: user.stepGoal,
        sleepHours: user.sleepGoalHours,
        weightKg: user.weightGoalKg ?? null,
      },
      sleepSchedule: {
        bedtime: user.sleepBedtime,
        wakeTime: user.sleepWakeTime,
        weekendBedtime: user.sleepWeekendBedtime,
        weekendWakeTime: user.sleepWeekendWakeTime,
      },
      createdAt: iso(user.createdAt),
    },
    habits: habits.map((h) => ({
      day: h.day,
      waterGlasses: h.waterGlasses,
      steps: h.steps,
      sleepHours: h.sleepHours,
      stepsSource: h.steps != null ? (h.stepsSource ?? null) : null,
      sleepSource: h.sleepHours != null ? (h.sleepSource ?? null) : null,
    })),
    checkIns: checkIns.map((c) => ({
      day: c.day,
      at: iso(c.at ?? c.createdAt),
      mood: c.mood,
      energy: c.energy,
      note: c.note ?? '',
    })),
    cycle: {
      periods: periods.map((p) => ({ start: p.start, end: p.end })),
      days: cycleDays.map((d) => ({
        day: d.day,
        flow: d.flow,
        symptoms: d.symptoms,
        discharge: d.discharge,
        note: d.note,
      })),
    },
    weight: weights.map((w) => ({ day: w.day, kg: w.kg })),
    vitals: vitals.map((v) => ({
      kind: v.kind,
      at: iso(v.at),
      day: v.day,
      systolic: v.systolic,
      diastolic: v.diastolic,
      pulse: v.pulse,
      glucoseMmol: v.glucoseMmol,
      glucoseContext: v.glucoseContext,
      note: v.note,
    })),
    band: band
      ? {
          bandId: band.bandId,
          model: band.bandModel,
          firmware: band.firmware,
          pairedAt: iso(band.pairedAt),
          lastSyncedAt: iso(band.lastSyncedAt),
        }
      : null,
    trustedDevices: devices.map((d) => ({
      label: d.label,
      lastSeenAt: iso(d.lastSeenAt),
      addedAt: iso(d.createdAt),
    })),
  };
};

//Emails the export to the account's address, which must be confirmed first so health data never
//goes to a mistyped address.
export const emailMyData = async (user: IUser): Promise<boolean> => {
  if (!user.emailVerified) {
    throw appError(
      ErrorCode.EMAIL_NOT_VERIFIED,
      'Please confirm your email address first, so your data goes to the right inbox.',
      {
        reason: 'EXPORT',
      }
    );
  }
  const data = await buildExport(user);
  await sendDataExportEmail({
    to: user.email,
    language: user.language,
    filename: `imara-afya-data-${dayInZone(new Date(), user.timezone)}.json`,
    json: JSON.stringify(data, null, 2),
  });
  return true;
};
