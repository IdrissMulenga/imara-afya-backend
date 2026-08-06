import PeriodCycle from './../../models/periodCycle.js';
import type { Context } from "../context.js"
import { authCheck, womenOnlyCheck } from './../../services/authServices.js';
import { GraphQLError } from 'graphql';
import type { LogPeriodArgs, UpdatePeriodArgs, RemovePeriodArgs, SetCycleRegularityArgs } from "../../utils/types.js"
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

//a usable date is "YYYY-MM-DD", parseable, and not in the future. A future or
//malformed start date would skew averageCycleLength and give her a wrong
//prediction, which is the one thing this screen must not do.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const assertUsableDate = (value: string, label: string) => {
    if (!DATE_RE.test(value) || Number.isNaN(toDate(value).getTime())) {
        throw new GraphQLError(`${label} must be a real date`, {
            extensions: { code: 'BAD_USER_INPUT' },
        });
    }

    if (value > todayIso()) {
        throw new GraphQLError(`${label} cannot be in the future`, {
            extensions: { code: 'BAD_USER_INPUT' },
        });
    }
};

//a period lasting more than three weeks is far more likely a typo than real,
//and either way it's worth her checking rather than us silently storing it
const MAX_PERIOD_DAYS = 21;

//Cycle-to-cycle variation of more than about 8 days is the usual clinical
//threshold for calling a cycle irregular. We use it only to decide how much to
//trust our own prediction and whether to suggest she mention it to a clinician —
//never to diagnose anything.
const IRREGULAR_VARIATION_DAYS = 8;

//how confident the countdown is. "low" means the app should stop showing a
//precise number, because a precise number would be a lie.
const confidenceFor = (
    gaps: number[],
    variation: number,
    regularity: string,
) => {
    //she told us it's irregular — believe her over our own arithmetic
    if (regularity === 'irregular') return 'low';

    //one gap is a single observation, not a pattern
    if (gaps.length < 2) return 'low';

    if (variation >= IRREGULAR_VARIATION_DAYS) return 'low';
    if (variation >= 4 || gaps.length < 3) return 'medium';

    return 'high';
};

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

      const regularity = context.user!.get('cycleRegularity') ?? 'unknown';

      //default to a typical 28 day cycle until we have enough data to do better
      let averageCycleLength = 28;

      //gaps between consecutive starts — the raw material for every number here
      const gaps: number[] = [];

      for (let i = 1; i < cycles.length; i++) {
        const prev = toDate(cycles[i - 1].get('startDate'));
        const curr = toDate(cycles[i].get('startDate'));
        const gap = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));

        //ignore impossible gaps rather than letting one bad row move the average
        if (gap > 10 && gap < 90) gaps.push(gap);
      }

      if (gaps.length) {
        averageCycleLength = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
      }

      //spread between her shortest and longest cycle
      const cycleVariation = gaps.length >= 2 ? Math.max(...gaps) - Math.min(...gaps) : null;

      const confidence = confidenceFor(gaps, cycleVariation ?? 0, regularity);

      //Only raised from her own logged data, and only once there's enough of it
      //to mean something. This is a prompt to talk to someone, not a diagnosis.
      const irregularityFlag =
        gaps.length >= 3 && (cycleVariation ?? 0) >= IRREGULAR_VARIATION_DAYS;

      //average bleed length, from the cycles she has actually closed. This is
      //what endDate was always for — until now nothing read it.
      const finished = cycles.filter((c) => !!c.get('endDate'));

      const averagePeriodLength = finished.length
        ? Math.round(
            finished.reduce(
              (total, c) => total + daysBetween(c.get('startDate'), String(c.get('endDate'))) + 1,
              0,
            ) / finished.length,
          )
        : null;

      //without at least one logged cycle we can't anchor a prediction
      if (cycles.length === 0) {
        return {
          basedOnCycles: 0,
          averageCycleLength,
          averagePeriodLength: null,
          cycleVariation: null,
          confidence: 'low',
          regularity,
          irregularityFlag: false,
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
        averagePeriodLength,
        cycleVariation,
        confidence,
        regularity,
        irregularityFlag,
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
        assertUsableDate(startDate, 'Start date');

        if (endDate) {
          assertUsableDate(endDate, 'End date');

          if (endDate < startDate) {
            throw new GraphQLError('End date cannot be before the start date', {
              extensions: { code: 'BAD_USER_INPUT' },
            });
          }

          if (daysBetween(startDate, endDate) > MAX_PERIOD_DAYS) {
            throw new GraphQLError('That period is unusually long. Please check the dates.', {
              extensions: { code: 'BAD_USER_INPUT' },
            });
          }
        }

        //don't create a second entry for a day she already logged — otherwise
        //a double tap silently corrupts every average built from these gaps
        const duplicate = await PeriodCycle.findOne({ user: context.user!.id, startDate });

        if (duplicate) {
          throw new GraphQLError('You already logged a period starting that day', {
            extensions: { code: 'PERIOD_ALREADY_LOGGED' },
          });
        }

        //an unfinished cycle must be closed before starting the next one
        const open = await PeriodCycle.findOne({
          user: context.user!.id,
          $or: [{ endDate: null }, { endDate: { $exists: false } }],
        });

        if (open && !endDate) {
          throw new GraphQLError('Please mark your current period as finished first', {
            extensions: { code: 'PERIOD_STILL_OPEN' },
          });
        }

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

        //validate against what the record will look like AFTER the edit, not
        //just the fields that arrived — otherwise moving one date past the
        //other slips through
        const nextStart = startDate ?? cycle.get('startDate');
        const nextEnd = endDate ?? cycle.get('endDate');

        if (startDate !== undefined) assertUsableDate(startDate, 'Start date');
        if (endDate !== undefined && endDate !== null) assertUsableDate(endDate, 'End date');

        if (nextEnd) {
          if (nextEnd < nextStart) {
            throw new GraphQLError('End date cannot be before the start date', {
              extensions: { code: 'BAD_USER_INPUT' },
            });
          }

          if (daysBetween(nextStart, nextEnd) > MAX_PERIOD_DAYS) {
            throw new GraphQLError('That period is unusually long. Please check the dates.', {
              extensions: { code: 'BAD_USER_INPUT' },
            });
          }
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

    //TELL US WHETHER HER CYCLE IS PREDICTABLE.
    //Her own answer outranks our arithmetic: a woman knows whether her period
    //turns up when expected, and we should not show her a confident countdown
    //she has already told us not to trust.
    setCycleRegularity: async (_: unknown, { regularity }: SetCycleRegularityArgs, context: Context) => {
      authCheck(context);
      womenOnlyCheck(context);

      try {
        if (!['regular', 'irregular', 'unknown'].includes(regularity)) {
          throw new GraphQLError('Invalid cycle regularity', {
            extensions: { code: 'BAD_USER_INPUT' },
          });
        }

        const user = context.user!;

        user.set('cycleRegularity', regularity);

        await user.save();

        return user;
      } catch (error: any) {
        if (error instanceof GraphQLError) {
          throw error;
        }

        throw new GraphQLError('Unexpected error while saving your answer', {
          extensions: { code: 'REGULARITY_UPDATE_FAILED' },
        });
      }
    },
  },
};
