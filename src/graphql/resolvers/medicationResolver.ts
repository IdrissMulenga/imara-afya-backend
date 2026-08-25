import Medication from './../../models/medication.js';
import MedicationLog from './../../models/medicationLog.js';
import type { Context } from "../context.js"
import { authCheck } from './../../services/authServices.js';
import { GraphQLError } from 'graphql';
import type { AddMedicationArgs, UpdateMedicationArgs, RemoveMedicationArgs, MarkMedicationTakenArgs, UnmarkMedicationTakenArgs, MyMedicationLogsArgs, MedicationAdherenceArgs } from "../../utils/types.js"
import { LIMITS } from "../../utils/limits.js"
import {
  TIME_RE, assertDate, assertInstant, rethrow, upsertRetryingOnDuplicate, userDay, userToday,
} from "../../utils/resolverHelpers.js"
import { addDays, daysBetween } from "../../utils/datetime.js"
import { daysOfStockLeft, dosesDueOn, isDueOn } from "../../utils/medicationSchedule.js"


//SHAPE A MEDICATION DOCUMENT for GraphQL.
//
//`dueToday` and `daysOfStockLeft` are computed here rather than stored: both
//depend on what day it is for THIS user, and a stored copy would be a value
//that is right when written and wrong by morning.
const toMedication = (doc: any, today: string) => ({
  id: doc.id,
  name: doc.get('name'),
  dosage: doc.get('dosage') ?? null,
  times: doc.get('times') ?? [],
  frequency: doc.get('frequency') ?? 'daily',
  days: doc.get('days') ?? [],
  startDate: doc.get('startDate') ?? null,
  endDate: doc.get('endDate') ?? null,
  stock: doc.get('stock') ?? null,
  stockPerDose: doc.get('stockPerDose') ?? 1,
  refillAtDays: doc.get('refillAtDays') ?? 5,
  daysOfStockLeft: daysOfStockLeft({
    times: doc.get('times'),
    frequency: doc.get('frequency'),
    days: doc.get('days'),
    stock: doc.get('stock'),
    stockPerDose: doc.get('stockPerDose'),
  }),
  dueToday: isDueOn(
    {
      frequency: doc.get('frequency'),
      days: doc.get('days'),
      startDate: doc.get('startDate'),
      endDate: doc.get('endDate'),
      active: doc.get('active'),
    },
    today,
  ),
  active: doc.get('active'),
});


//shape a medication log document into the GraphQL MedicationDose type
const toDose = (log: any) => ({
  id: log.id,
  medicationId: String(log.get('medication')),
  status: log.get('status'),
  takenAt: log.get('takenAt'),
  slot: log.get('slot') ?? null,
  localDate: log.get('localDate'),
});


//A dose belongs to one of the medicine's scheduled times, or to none at all.
//
//Rejecting a slot the medicine doesn't have matters: silently accepting "09:00"
//for a medicine scheduled at 08:00 and 20:00 would create a dose that no screen
//can ever show, and the morning dose would still look untaken.
const resolveSlot = (medication: any, slot?: string | null) => {
  const times: string[] = medication.get('times') ?? [];

  if (slot === undefined || slot === null || slot === '') {
    //A scheduled medicine taken without saying which dose is ambiguous. Assume
    //nothing — defaulting to the first outstanding time is a guess we'd get
    //wrong half the day, so require the caller to be explicit.
    return null;
  }

  if (!TIME_RE.test(slot)) {
    throw new GraphQLError('Slot must be a time in HH:MM format', {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }

  if (!times.includes(slot)) {
    throw new GraphQLError('That medicine is not scheduled at that time', {
      extensions: { code: 'UNKNOWN_DOSE_SLOT' },
    });
  }

  return slot;
};



//CHECK THE SCHEDULING FIELDS, once, for both add and update.
//
//These arrive from the app but the app is not a security boundary, and a bad
//value here doesn't just look wrong — it feeds the adherence denominator. A
//medicine with an end date before its start date would be "due" on no day at
//all, quietly scoring 0% forever.
const assertSchedule = (input: {
  frequency?: string;
  days?: number[];
  startDate?: string;
  endDate?: string;
  times?: string[];
  stock?: number;
  stockPerDose?: number;
  refillAtDays?: number;
}) => {
  const { frequency, days, startDate, endDate, times, stock, stockPerDose, refillAtDays } = input;

  if (frequency !== undefined && !FREQUENCIES.includes(frequency)) {
    throw new GraphQLError(`Frequency must be one of: ${FREQUENCIES.join(', ')}`, {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }

  if (days?.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    throw new GraphQLError('Days must be numbers from 0 (Sunday) to 6 (Saturday)', {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }

  if (times?.some((time) => !TIME_RE.test(time))) {
    throw new GraphQLError('Times must be in HH:MM format', {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }

  if (startDate) assertDate(startDate, 'Start date');
  if (endDate) assertDate(endDate, 'End date');

  if (startDate && endDate && daysBetween(startDate, endDate) < 0) {
    throw new GraphQLError('The course cannot end before it starts', {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }

  for (const [value, label] of [
    [stock, 'Stock'], [stockPerDose, 'Units per dose'], [refillAtDays, 'Refill warning'],
  ] as const) {
    if (value !== undefined && value !== null
      && (!Number.isFinite(value) || value < 0 || value > 100_000)) {
      throw new GraphQLError(`${label} must be a number between 0 and 100000`, {
        extensions: { code: 'BAD_USER_INPUT' },
      });
    }
  }
};


//kept next to the model's own enum — the two must agree or a valid-looking
//value fails at save time with a mongoose error instead of a helpful one
const FREQUENCIES = ['daily', 'alternate', 'specificDays'];

//A year is more history than anyone reads and bounds the loop below, which runs
//once per day per medicine.
const ADHERENCE_MAX_DAYS = 365;


//TAKE THIS DOSE OFF THE PACKET — or put it back, with sign -1.
//
//A no-op unless the user chose to track stock. Uses $inc rather than
//read-add-write so two doses logged at once cannot lose one of the
//decrements, and clamps at zero: a negative tablet count is not a thing, and
//it would make "days left" negative on a screen someone is trusting.
const consumeStock = async (medication: any, sign = 1) => {
  if (medication.get('stock') == null) return;

  const perDose = medication.get('stockPerDose') ?? 1;

  await Medication.updateOne(
    { _id: medication.id },
    { $inc: { stock: -sign * perDose } },
  );

  await Medication.updateOne(
    { _id: medication.id, stock: { $lt: 0 } },
    { $set: { stock: 0 } },
  );
};


export default {
  Query: {
    //LIST THE LOGGED IN USER'S MEDICATIONS
    myMedications: async (_: unknown, __: unknown, context: Context) => {
      authCheck(context);

      const today = userToday(context);

      //only return medications that belong to the logged in user
      const medications = await Medication.find({ user: context.user!.id })
        .sort({ createdAt: -1 })
        .limit(LIMITS.medications);

      return medications.map((m) => toMedication(m, today));
    },

    //LIST DOSE LOGS (optionally for one medication and/or one day)
    myMedicationLogs: async (_: unknown, { medicationId, date }: MyMedicationLogsArgs, context: Context) => {
      authCheck(context);

      const filter: any = { user: context.user!.id };

      //optional filters: a specific medication and/or a specific day
      if (medicationId) filter.medication = medicationId;
      //Match on the user's own calendar day, not on the UTC timestamp. The old
      //regex on takenAt silently dropped anything logged between midnight and
      //the UTC offset — for Bujumbura that was every dose taken before 02:00.
      if (date) filter.localDate = assertDate(date);

      const logs = await MedicationLog.find(filter).sort({ takenAt: -1 }).limit(LIMITS.medicationLogs);

      return logs.map(toDose);
    },

    //ADHERENCE — how much of what was DUE actually got taken.
    //
    //The denominator is the point. A percentage over "doses you recorded" is
    //always 100% and tells nobody anything; this counts what each medicine's
    //own frequency and course dates say should have happened, then compares.
    //
    //Today is EXCLUDED from the denominator. A dose due at 20:00 is not missed
    //at 09:00, and counting it would show everyone a number that climbs through
    //the day and means nothing before bedtime.
    medicationAdherence: async (
      _: unknown,
      { days, medicationId }: MedicationAdherenceArgs,
      context: Context,
    ) => {
      authCheck(context);

      const today = userToday(context);
      const window = Math.min(Math.max(days ?? 30, 1), ADHERENCE_MAX_DAYS);

      //yesterday backwards: see the note above about today
      const to = addDays(today, -1);
      const from = addDays(to, -(window - 1));

      const filter: any = { user: context.user!.id };

      if (medicationId) filter._id = medicationId;

      const medications = await Medication.find(filter).limit(LIMITS.medications);

      const logFilter: any = {
        user: context.user!.id,
        localDate: { $gte: from, $lte: to },
        status: 'taken',
      };

      if (medicationId) logFilter.medication = medicationId;

      const logs = await MedicationLog.find(logFilter).limit(LIMITS.medicationLogs * 4);

      //"<medicationId>@<day>@<slot>" — one key per dose that actually happened
      const taken = new Set(
        logs
          .filter((log) => log.get('slot'))
          .map((log) => `${String(log.get('medication'))}@${log.get('localDate')}@${log.get('slot')}`),
      );

      const byDay = new Map<string, { due: number; taken: number }>();
      const bySlot = new Map<string, { due: number; taken: number }>();

      let totalDue = 0;
      let totalTaken = 0;

      for (let i = 0; i < window; i += 1) {
        const day = addDays(from, i);

        byDay.set(day, { due: 0, taken: 0 });

        for (const medication of medications) {
          const schedule = {
            frequency: medication.get('frequency'),
            days: medication.get('days'),
            startDate: medication.get('startDate'),
            endDate: medication.get('endDate'),
            times: medication.get('times'),
            //A PAUSED medicine still counts for the days it was active — but we
            //cannot know when it was paused, so treat "paused now" as "not due
            //then" rather than marking a fortnight retrospectively missed for
            //someone who stopped on their doctor's advice.
            active: medication.get('active'),
          };

          if (!dosesDueOn(schedule, day)) continue;

          for (const slot of (medication.get('times') ?? []) as string[]) {
            const hit = taken.has(`${medication.id}@${day}@${slot}`);

            totalDue += 1;
            byDay.get(day)!.due += 1;

            const slotRow = bySlot.get(slot) ?? { due: 0, taken: 0 };
            slotRow.due += 1;

            if (hit) {
              totalTaken += 1;
              byDay.get(day)!.taken += 1;
              slotRow.taken += 1;
            }

            bySlot.set(slot, slotRow);
          }
        }
      }

      //consecutive perfect days counting back from the most recent one. A day
      //with nothing due doesn't break a streak — there was nothing to fail.
      let streak = 0;

      for (let i = window - 1; i >= 0; i -= 1) {
        const row = byDay.get(addDays(from, i))!;

        if (!row.due) continue;
        if (row.taken < row.due) break;

        streak += 1;
      }

      return {
        from,
        to,
        due: totalDue,
        taken: totalTaken,
        //no honest percentage of nothing — see the schema comment
        percent: totalDue ? Math.round((totalTaken / totalDue) * 100) : null,
        streak,
        days: [...byDay.entries()].map(([date, row]) => ({ date, ...row })),
        bySlot: [...bySlot.entries()]
          .map(([slot, row]) => ({ slot, ...row }))
          .sort((a, b) => a.slot.localeCompare(b.slot)),
      };
    },
  },

  Mutation: {
    //ADD A MEDICATION REMINDER
    addMedication: async (_: unknown, { input }: AddMedicationArgs, context: Context) => {
      authCheck(context);

      try {
        assertSchedule(input);

        //create the medication tied to the logged in user
        const medication = new Medication({ user: context.user!.id, ...input });

        await medication.save();

        return toMedication(medication, userToday(context));
      } catch (error) {
        throw rethrow(
          error, 'Unexpected error while adding medication', 'MEDICATION_CREATE_FAILED',
        );
      }
    },

    //UPDATE A MEDICATION (also used to turn the reminder on/off via active)
    updateMedication: async (_: unknown, { id, input }: UpdateMedicationArgs, context: Context) => {
      authCheck(context);

      try {
        assertSchedule(input);

        //make sure the medication exists and belongs to this user
        const medication = await Medication.findOne({ _id: id, user: context.user!.id });

        if (!medication) {
          throw new GraphQLError('Medication not found', {
            extensions: { code: 'MEDICATION_NOT_FOUND' },
          });
        }

        //only update the fields the user actually sent. Iterating the input
        //rather than listing every field means a new one added to the schema
        //cannot be silently ignored here, which is how `frequency` came to be
        //stored and never read.
        for (const [field, value] of Object.entries(input)) {
          if (value !== undefined) medication.set(field, value);
        }

        await medication.save();

        return toMedication(medication, userToday(context));
      } catch (error) {
        throw rethrow(
          error, 'Unexpected error while updating medication', 'MEDICATION_UPDATE_FAILED',
        );
      }
    },

    //REMOVE A MEDICATION
    removeMedication: async (_: unknown, { id }: RemoveMedicationArgs, context: Context) => {
      authCheck(context);

      try {
        //only delete a medication that belongs to the logged in user
        const deleted = await Medication.findOneAndDelete({ _id: id, user: context.user!.id });

        if (!deleted) {
          throw new GraphQLError('Medication not found', {
            extensions: { code: 'MEDICATION_NOT_FOUND' },
          });
        }

        return true;
      } catch (error) {
        throw rethrow(
          error, 'Unexpected error while removing medication', 'MEDICATION_DELETE_FAILED',
        );
      }
    },

    //RECORD THAT A DOSE WAS TAKEN (or skipped) — powers adherence + reminders
    //
    //`slot` says WHICH of the day's doses this is. A medicine scheduled at 08:00
    //and 20:00 has two independent doses; without the slot, taking the morning
    //one marked the whole day done and the app told people they had finished
    //their medication when they had not.
    markMedicationTaken: async (_: unknown, { medicationId, slot, takenAt, status }: MarkMedicationTakenArgs, context: Context) => {
      authCheck(context);

      try {
        //make sure the medication exists and belongs to this user
        const medication = await Medication.findOne({ _id: medicationId, user: context.user!.id });

        if (!medication) {
          throw new GraphQLError('Medication not found', {
            extensions: { code: 'MEDICATION_NOT_FOUND' },
          });
        }

        const doseSlot = resolveSlot(medication, slot);

        //default to "now" and "taken" when the caller doesn't specify.
        //Checked, because it comes from the phone and is fed straight into the
        //date helpers, where an unparseable value throws rather than complains.
        const at = takenAt ? assertInstant(takenAt, 'Taken at') : new Date().toISOString();

        //Which day this counts as depends on where the user is, not where the
        //server is. Derived from the instant so a backdated dose still lands on
        //the right day.
        const localDate = userDay(context, new Date(at));

        //A scheduled dose is upserted so a double tap — or a tap that the app
        //retried after a timeout on a bad connection — records one dose rather
        //than two. Unscheduled doses are inserted, because taking a painkiller
        //twice in an afternoon is a real thing that happened twice.
        if (doseSlot) {
          const log = await upsertRetryingOnDuplicate(async () => {
            const result = await MedicationLog.findOneAndUpdate(
              {
                user: context.user!.id,
                medication: medication.id,
                localDate,
                slot: doseSlot,
              },
              { $set: { status: status ?? 'taken', takenAt: at } },
              { new: true, upsert: true, setDefaultsOnInsert: true, includeResultMetadata: true },
            );

            return { doc: result.value, upsertedId: result.lastErrorObject?.upserted };
          });

          //STOCK COMES OFF THE PACKET, but only on a NEW dose.
          //
          //The upsert above is idempotent by design — a double tap, or a retry
          //after a timeout on a bad connection, records one dose. Decrementing
          //unconditionally would undo that: the same tap taken twice would take
          //two tablets off the count, and after a week on a bad line the app
          //would send someone to the pharmacy for a packet that is still half
          //full. `upsertedId` is set only when a row was actually inserted.
          if (log.upsertedId) await consumeStock(medication);

          return toDose(log.doc);
        }

        const log = new MedicationLog({
          user: context.user!.id,
          medication: medication.id,
          status: status ?? 'taken',
          takenAt: at,
          localDate,
          slot: null,
        });

        await log.save();

        //an as-needed dose is always a new row, so it always costs stock
        await consumeStock(medication);

        return toDose(log);
      } catch (error) {
        //bad status value (not in the enum) lands here
        throw rethrow(
          error, 'Unexpected error while logging dose', 'DOSE_LOG_FAILED', 'Invalid dose data',
        );
      }
    },

    //UNTICK A DOSE.
    //
    //Tapping the wrong row shouldn't be permanent until midnight. Returns true
    //whether or not there was anything to remove — the caller's intent is "this
    //dose is not taken", and that is the state either way.
    unmarkMedicationTaken: async (_: unknown, { medicationId, slot, date }: UnmarkMedicationTakenArgs, context: Context) => {
      authCheck(context);

      try {
        const medication = await Medication.findOne({ _id: medicationId, user: context.user!.id });

        if (!medication) {
          throw new GraphQLError('Medication not found', {
            extensions: { code: 'MEDICATION_NOT_FOUND' },
          });
        }

        const doseSlot = resolveSlot(medication, slot);
        const localDate = date ? assertDate(date) : userToday(context);

        const filter: any = {
          user: context.user!.id,
          medication: medication.id,
          localDate,
        };

        if (doseSlot) {
          filter.slot = doseSlot;

          //give the tablet back — an untick is "I hadn't actually taken it",
          //and leaving the stock decremented would drift the count down every
          //time someone corrected a mis-tap
          const removed = await MedicationLog.findOneAndDelete(filter);

          if (removed) await consumeStock(medication, -1);
        } else {
          //no slot given: remove the most recent unscheduled dose that day
          //rather than all of them, so untapping once undoes one tap
          const latest = await MedicationLog.findOne({ ...filter, slot: null })
            .sort({ takenAt: -1 });

          if (latest) {
            await MedicationLog.findByIdAndDelete(latest.id);
            await consumeStock(medication, -1);
          }
        }

        return true;
      } catch (error) {
        throw rethrow(error, 'Unexpected error while removing dose', 'DOSE_REMOVE_FAILED');
      }
    },
  },
};
