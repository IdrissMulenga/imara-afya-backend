import CheckIn from './../../models/checkIn.js';
import { Routine, RoutineLog } from './../../models/routine.js';
import type { Context } from "../context.js"
import { authCheck } from './../../services/authServices.js';
import { GraphQLError } from 'graphql';
import { LIMITS } from "../../utils/limits.js"
import { addDays, streakLength } from "../../utils/datetime.js"
import {
  TIME_RE, assertDate, assertNotFuture, assertScale, rethrow, upsertRetryingOnDuplicate, userToday,
} from "../../utils/resolverHelpers.js"
import type {
  CheckInSummaryArgs, MyCheckInsArgs, SaveCheckInArgs, RemoveCheckInArgs,
  TodayRoutinesArgs, MyRoutinesArgs, AddRoutineArgs, UpdateRoutineArgs,
  RemoveRoutineArgs, SetRoutineDoneArgs,
} from "../../utils/types.js"


//the default window for averages — long enough to show a trend, short enough
//that a bad fortnight two months ago isn't still dragging the number down
const DEFAULT_WINDOW = 30;
const MAX_WINDOW = 365;

//Mood and energy are both 1–5. Named once so the two call sites can't drift
//apart from each other or from what the schema promises.
const SCALE_MIN = 1;
const SCALE_MAX = 5;


const toCheckIn = (doc: any) => ({
  id: doc.id,
  date: doc.get('date'),
  mood: doc.get('mood'),
  energy: doc.get('energy'),
  note: doc.get('note') ?? null,
});


const toRoutine = (doc: any, extra: { done?: boolean; streak?: number } = {}) => ({
  id: doc.id,
  title: doc.get('title'),
  icon: doc.get('icon'),
  days: doc.get('days') ?? [],
  time: doc.get('time') ?? null,
  active: doc.get('active'),
  position: doc.get('position') ?? 0,
  done: extra.done ?? null,
  streak: extra.streak ?? null,
});


//Which weekday a "YYYY-MM-DD" falls on, 0 = Sunday.
//Built from UTC so it never shifts with the server's own zone.
const weekdayOf = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);

  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};


//Is this routine due on this date? An empty `days` means every day.
const isDueOn = (days: number[], day: string) =>
  !days.length || days.includes(weekdayOf(day));


//STREAK FOR ONE ROUTINE.
//
//Only counts days the routine was actually DUE. A weekday-only routine must not
//have its streak broken by a Sunday it was never meant to happen on — that's
//the difference between a streak that motivates and one that feels unfair.
const routineStreak = (days: number[], doneDates: Set<string>, today: string) => {
  let cursor = today;
  let length = 0;

  //if today is due but not yet ticked, start from yesterday rather than
  //declaring the streak broken at breakfast
  if (isDueOn(days, cursor) && !doneDates.has(cursor)) {
    cursor = addDays(cursor, -1);
  }

  //a year back is far more than anyone needs and bounds the loop
  for (let i = 0; i < MAX_WINDOW; i += 1) {
    if (!isDueOn(days, cursor)) {
      cursor = addDays(cursor, -1);
      continue;
    }

    if (!doneDates.has(cursor)) break;

    length += 1;
    cursor = addDays(cursor, -1);
  }

  return length;
};


export default {
  Query: {
    //THE DASHBOARD CARD: today's check-in, the streak, and recent averages.
    checkInSummary: async (_: unknown, { days }: CheckInSummaryArgs, context: Context) => {
      authCheck(context);

      const today = userToday(context);
      const windowDays = Math.min(Math.max(days ?? DEFAULT_WINDOW, 1), MAX_WINDOW);
      const from = addDays(today, -(windowDays - 1));

      const entries = await CheckIn.find({
        user: context.user!.id,
        date: { $gte: from, $lte: today },
      }).sort({ date: -1 }).limit(MAX_WINDOW);

      const todayEntry = entries.find((e) => e.get('date') === today) ?? null;

      const moodTotal = entries.reduce((sum, e) => sum + e.get('mood'), 0);
      const energyTotal = entries.reduce((sum, e) => sum + e.get('energy'), 0);

      //round to one decimal — "3.7" is honest, "3.6666666" is noise
      const average = (total: number) =>
        entries.length ? Math.round((total / entries.length) * 10) / 10 : null;

      return {
        today: todayEntry ? toCheckIn(todayEntry) : null,
        streak: streakLength(entries.map((e) => e.get('date')), today),
        averageMood: average(moodTotal),
        averageEnergy: average(energyTotal),
        loggedDays: entries.length,
        windowDays,
      };
    },

    myCheckIns: async (_: unknown, { from, to }: MyCheckInsArgs, context: Context) => {
      authCheck(context);

      const filter: any = { user: context.user!.id };

      if (from || to) {
        filter.date = {};
        if (from) filter.date.$gte = assertDate(from);
        if (to) filter.date.$lte = assertDate(to);
      }

      const entries = await CheckIn.find(filter)
        .sort({ date: -1 })
        .limit(LIMITS.checkIns);

      return entries.map(toCheckIn);
    },

    //WHAT'S DUE TODAY, with each routine's tick state and streak.
    todayRoutines: async (_: unknown, { date }: TodayRoutinesArgs, context: Context) => {
      authCheck(context);

      const today = userToday(context);
      const day = date ? assertDate(date) : today;

      const routines = await Routine.find({ user: context.user!.id, active: true })
        .sort({ position: 1, createdAt: 1 })
        .limit(LIMITS.routines);

      const due = routines.filter((r) => isDueOn(r.get('days') ?? [], day));

      //One query for every log in the streak window, rather than one per
      //routine — a person with ten routines would otherwise cost ten round
      //trips on a screen that opens constantly.
      const since = addDays(day, -MAX_WINDOW);

      const logs = await RoutineLog.find({
        user: context.user!.id,
        date: { $gte: since, $lte: day },
      }).limit(LIMITS.routineLogs);

      //routine id -> the set of days it was ticked
      const byRoutine = new Map<string, Set<string>>();

      for (const log of logs) {
        const key = String(log.get('routine'));

        if (!byRoutine.has(key)) byRoutine.set(key, new Set());

        byRoutine.get(key)!.add(log.get('date'));
      }

      const list = due.map((r) => {
        const ticked = byRoutine.get(r.id) ?? new Set<string>();

        return toRoutine(r, {
          done: ticked.has(day),
          streak: routineStreak(r.get('days') ?? [], ticked, day),
        });
      });

      return {
        date: day,
        routines: list,
        doneCount: list.filter((r) => r.done).length,
        dueCount: list.length,
      };
    },

    myRoutines: async (_: unknown, { includeArchived }: MyRoutinesArgs, context: Context) => {
      authCheck(context);

      const filter: any = { user: context.user!.id };

      if (!includeArchived) filter.active = true;

      const routines = await Routine.find(filter)
        .sort({ position: 1, createdAt: 1 })
        .limit(LIMITS.routines);

      return routines.map((r) => toRoutine(r));
    },
  },

  Mutation: {
    //SAVE TODAY'S CHECK-IN.
    //
    //An upsert rather than a create: checking in twice on one day means she
    //changed her mind, not that there are two of her. The unique index makes
    //this the only way it can work.
    saveCheckIn: async (_: unknown, { input }: SaveCheckInArgs, context: Context) => {
      authCheck(context);

      const { mood, energy, note, date } = input;

      const today = userToday(context);
      const day = date ? assertNotFuture(assertDate(date), today) : today;

      assertScale(mood, SCALE_MIN, SCALE_MAX, 'Mood');
      assertScale(energy, SCALE_MIN, SCALE_MAX, 'Energy');

      const trimmedNote = note?.trim();

      try {
        //`$set: { note: undefined }` is dropped by mongoose rather than written,
        //so deleting the text from a check-in saved the mood and silently left
        //yesterday's note attached. Removing it has to be an explicit $unset.
        const entry = await upsertRetryingOnDuplicate(() =>
          CheckIn.findOneAndUpdate(
            { user: context.user!.id, date: day },
            trimmedNote
              ? { $set: { mood, energy, note: trimmedNote } }
              : { $set: { mood, energy }, $unset: { note: '' } },
            { new: true, upsert: true, setDefaultsOnInsert: true },
          ));

        return toCheckIn(entry);
      } catch (error) {
        throw rethrow(
          error, 'Unexpected error while saving your check-in', 'CHECKIN_SAVE_FAILED',
          'Invalid check-in data',
        );
      }
    },

    removeCheckIn: async (_: unknown, { date }: RemoveCheckInArgs, context: Context) => {
      authCheck(context);

      const day = assertDate(date);

      try {
        const deleted = await CheckIn.findOneAndDelete({ user: context.user!.id, date: day });

        if (!deleted) {
          throw new GraphQLError('No check-in on that date', {
            extensions: { code: 'CHECKIN_NOT_FOUND' },
          });
        }

        return true;
      } catch (error) {
        throw rethrow(error, 'Unexpected error while removing your check-in', 'CHECKIN_DELETE_FAILED');
      }
    },

    addRoutine: async (_: unknown, { input }: AddRoutineArgs, context: Context) => {
      authCheck(context);

      const { title, icon, days, time } = input;

      if (!title?.trim()) {
        throw new GraphQLError('Give the routine a name', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      if (time && !TIME_RE.test(time)) {
        throw new GraphQLError('Time must be in HH:MM format', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      if (days?.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
        throw new GraphQLError('Days must be numbers from 0 (Sunday) to 6 (Saturday)', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      //A cap so one account can't fill the collection. Anyone with 50 daily
      //routines has a different problem than this app can solve.
      const existing = await Routine.countDocuments({ user: context.user!.id, active: true });

      if (existing >= LIMITS.routines) {
        throw new GraphQLError(`You can have up to ${LIMITS.routines} routines`, {
          extensions: { code: 'LIMIT_REACHED' },
        });
      }

      try {
        const routine = new Routine({
          user: context.user!.id,
          title: title.trim(),
          icon: icon?.trim() || undefined,
          //de-duplicated and sorted so the app never has to
          days: [...new Set(days ?? [])].sort((a, b) => a - b),
          time: time || undefined,
          position: existing,
        });

        await routine.save();

        return toRoutine(routine, { done: false, streak: 0 });
      } catch (error) {
        throw rethrow(error, 'Unexpected error while adding the routine', 'ROUTINE_CREATE_FAILED');
      }
    },

    updateRoutine: async (_: unknown, { id, input }: UpdateRoutineArgs, context: Context) => {
      authCheck(context);

      const { title, icon, days, time, active, position } = input;

      const routine = await Routine.findOne({ _id: id, user: context.user!.id });

      if (!routine) {
        throw new GraphQLError('Routine not found', {
          extensions: { code: 'ROUTINE_NOT_FOUND' },
        });
      }

      //`title` and `icon` are nullable in the schema, and `null.trim()` is a
      //TypeError — which escaped as an unexplained server error rather than as
      //anything the app could show. Blanking the name isn't allowed either:
      //addRoutine refuses an empty title, so updating to one shouldn't succeed.
      if (title !== undefined && !title?.trim()) {
        throw new GraphQLError('Give the routine a name', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      if (time !== undefined && time !== null && time !== '' && !TIME_RE.test(time)) {
        throw new GraphQLError('Time must be in HH:MM format', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      if (days?.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
        throw new GraphQLError('Days must be numbers from 0 (Sunday) to 6 (Saturday)', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      //the list is ordered by this, so a NaN would scatter the whole screen
      if (position !== undefined && position !== null && !Number.isInteger(position)) {
        throw new GraphQLError('Position must be a whole number', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      try {
        //only touch what was actually sent
        if (title !== undefined) routine.set('title', title!.trim());
        if (icon !== undefined) routine.set('icon', icon?.trim() || undefined);
        if (days !== undefined) routine.set('days', [...new Set(days)].sort((a, b) => a - b));
        if (time !== undefined) routine.set('time', time || undefined);
        if (active !== undefined) routine.set('active', active);
        if (position !== undefined) routine.set('position', position);

        await routine.save();

        return toRoutine(routine);
      } catch (error) {
        throw rethrow(
          error, 'Unexpected error while updating the routine', 'ROUTINE_UPDATE_FAILED',
          'Invalid routine data',
        );
      }
    },

    //Deletes the routine AND its history — leaving orphan logs behind would
    //quietly inflate any future "days completed" count.
    removeRoutine: async (_: unknown, { id }: RemoveRoutineArgs, context: Context) => {
      authCheck(context);

      try {
        const deleted = await Routine.findOneAndDelete({ _id: id, user: context.user!.id });

        if (!deleted) {
          throw new GraphQLError('Routine not found', {
            extensions: { code: 'ROUTINE_NOT_FOUND' },
          });
        }

        await RoutineLog.deleteMany({ user: context.user!.id, routine: deleted.id });

        return true;
      } catch (error) {
        throw rethrow(error, 'Unexpected error while removing the routine', 'ROUTINE_DELETE_FAILED');
      }
    },

    //TICK OR UNTICK a routine for a day.
    setRoutineDone: async (_: unknown, { id, done, date }: SetRoutineDoneArgs, context: Context) => {
      authCheck(context);

      const today = userToday(context);
      const day = date ? assertNotFuture(assertDate(date), today) : today;

      const routine = await Routine.findOne({ _id: id, user: context.user!.id });

      if (!routine) {
        throw new GraphQLError('Routine not found', {
          extensions: { code: 'ROUTINE_NOT_FOUND' },
        });
      }

      try {
        if (done) {
          //upsert, so tapping twice is harmless rather than a duplicate-key error
          await upsertRetryingOnDuplicate(() =>
            RoutineLog.findOneAndUpdate(
              { user: context.user!.id, routine: routine.id, date: day },
              { $setOnInsert: { user: context.user!.id, routine: routine.id, date: day } },
              { upsert: true, new: true, setDefaultsOnInsert: true },
            ));
        } else {
          await RoutineLog.findOneAndDelete({
            user: context.user!.id,
            routine: routine.id,
            date: day,
          });
        }

        //recompute the streak so the app can show it moving immediately
        const since = addDays(day, -MAX_WINDOW);

        const logs = await RoutineLog.find({
          user: context.user!.id,
          routine: routine.id,
          date: { $gte: since, $lte: day },
        }).limit(LIMITS.routineLogs);

        const ticked = new Set(logs.map((l) => l.get('date')));

        return toRoutine(routine, {
          done,
          streak: routineStreak(routine.get('days') ?? [], ticked, day),
        });
      } catch (error) {
        throw rethrow(
          error, 'Unexpected error while updating the routine', 'ROUTINE_UPDATE_FAILED',
        );
      }
    },
  },
};
