import PeriodCycle from './../../models/periodCycle.js';
import type { Context } from "../context.js"
import { authCheck, womenOnlyCheck } from './../../services/authServices.js';
import { GraphQLError } from 'graphql';
import type { LogPeriodArgs, UpdatePeriodArgs, RemovePeriodArgs } from "../../utils/types.js"
import { LIMITS } from "../../utils/limits.js"


//small helpers to work with plain "YYYY-MM-DD" date strings
const toDate = (s: string) => new Date(s);
const addDays = (date: Date, days: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
};
const todayIso = () => new Date().toISOString().slice(0, 10);
//whole days from one date string to another (positive = in the future)
const daysBetween = (fromIso: string, toIso: string) =>
    Math.round((toDate(toIso).getTime() - toDate(fromIso).getTime()) / (1000 * 60 * 60 * 24));



export default {
  Query: {
    //LIST THE LOGGED IN USER'S LOGGED CYCLES (newest first)
    myCycles: async (_: unknown, __: unknown, context: Context) => {
      authCheck(context);
      womenOnlyCheck(context);

      return PeriodCycle.find({ user: context.user!.id }).sort({ startDate: -1 }).limit(LIMITS.cycles);
    },

    //PREDICT THE NEXT PERIOD AND FERTILE WINDOW FROM PAST CYCLES
    cyclePrediction: async (_: unknown, __: unknown, context: Context) => {
      authCheck(context);
      womenOnlyCheck(context);

      //grab the cycles oldest first so we can measure the gaps between them
      const cycles = await PeriodCycle.find({ user: context.user!.id }).sort({ startDate: 1 }).limit(LIMITS.cycles);

      //default to a typical 28 day cycle until we have enough data to do better
      let averageCycleLength = 28;

      if (cycles.length >= 2) {
        let total = 0;

        for (let i = 1; i < cycles.length; i++) {
          const prev = toDate(cycles[i - 1].get('startDate'));
          const curr = toDate(cycles[i].get('startDate'));
          const gap = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
          total += gap;
        }

        averageCycleLength = Math.round(total / (cycles.length - 1));
      }

      //without at least one logged cycle we can't anchor a prediction
      if (cycles.length === 0) {
        return {
          basedOnCycles: 0,
          averageCycleLength,
          nextPeriodDate: null,
          fertileWindowStart: null,
          fertileWindowEnd: null,
          daysUntilNextPeriod: null,
          daysUntilFertileWindow: null,
        };
      }

      //predict from the most recent start date
      const lastStart = toDate(cycles[cycles.length - 1].get('startDate'));
      const nextPeriodDate = addDays(lastStart, averageCycleLength);

      //ovulation is roughly 14 days before the next period; fertile window sits around it
      const next = toDate(nextPeriodDate);
      const fertileWindowStart = addDays(next, -19);
      const fertileWindowEnd = addDays(next, -13);

      //countdowns from today — this powers the "days left until your period" reminder
      const today = todayIso();

      return {
        basedOnCycles: cycles.length,
        averageCycleLength,
        nextPeriodDate,
        fertileWindowStart,
        fertileWindowEnd,
        daysUntilNextPeriod: daysBetween(today, nextPeriodDate),
        daysUntilFertileWindow: daysBetween(today, fertileWindowStart),
      };
    },
  },

  Mutation: {
    //LOG A NEW PERIOD START (and optional end)
    logPeriod: async (_: unknown, { input }: LogPeriodArgs, context: Context) => {
      authCheck(context);
      womenOnlyCheck(context);

      const { startDate, endDate } = input

      try {
        const cycle = new PeriodCycle({ user: context.user!.id, startDate, endDate });

        await cycle.save();

        return cycle;
      } catch (error: any) {
        if (error instanceof GraphQLError) {
          throw error;
        }

        throw new GraphQLError('Unexpected error while logging period', {
          extensions: { code: 'PERIOD_CREATE_FAILED' },
        });
      }
    },

    //UPDATE A LOGGED CYCLE
    updatePeriod: async (_: unknown, { id, input }: UpdatePeriodArgs, context: Context) => {
      authCheck(context);
      womenOnlyCheck(context);

      const { startDate, endDate } = input

      try {
        const cycle = await PeriodCycle.findOne({ _id: id, user: context.user!.id });

        if (!cycle) {
          throw new GraphQLError('Cycle not found', {
            extensions: { code: 'PERIOD_NOT_FOUND' },
          });
        }

        //only update the fields the user actually sent
        if (startDate !== undefined) cycle.set('startDate', startDate);
        if (endDate !== undefined) cycle.set('endDate', endDate);

        await cycle.save();

        return cycle;
      } catch (error: any) {
        if (error instanceof GraphQLError) {
          throw error;
        }

        throw new GraphQLError('Unexpected error while updating period', {
          extensions: { code: 'PERIOD_UPDATE_FAILED' },
        });
      }
    },

    //REMOVE A LOGGED CYCLE
    removePeriod: async (_: unknown, { id }: RemovePeriodArgs, context: Context) => {
      authCheck(context);
      womenOnlyCheck(context);

      try {
        const deleted = await PeriodCycle.findOneAndDelete({ _id: id, user: context.user!.id });

        if (!deleted) {
          throw new GraphQLError('Cycle not found', {
            extensions: { code: 'PERIOD_NOT_FOUND' },
          });
        }

        return true;
      } catch (error: any) {
        if (error instanceof GraphQLError) {
          throw error;
        }

        throw new GraphQLError('Unexpected error while removing period', {
          extensions: { code: 'PERIOD_DELETE_FAILED' },
        });
      }
    },
  },
};
