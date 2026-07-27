import Pregnancy from './../../models/pregnancy.js';
import type { Context } from "../context.js"
import { authCheck, womenOnlyCheck } from './../../services/authServices.js';
import { GraphQLError } from 'graphql';
import type { StartPregnancyArgs, UpdatePregnancyArgs, EndPregnancyArgs, RemovePregnancyArgs } from "../../utils/types.js"


//same plain "YYYY-MM-DD" helpers the period tracker uses
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

//a date string is only usable if it parses and isn't in the future
const isValidPastDate = (s: string) => {
    const d = toDate(s);
    return !Number.isNaN(d.getTime()) && s <= todayIso();
};

//Naegele's rule — 280 days from the first day of the last period
const GESTATION_DAYS = 280;

//weeks 1-13 first, 14-27 second, 28+ third
const trimesterFor = (weeks: number) => {
    if (weeks < 14) return 1;
    if (weeks < 28) return 2;
    return 3;
};



export default {
  Query: {
    //EVERY PREGNANCY THE USER HAS LOGGED, ACTIVE ONE FIRST
    myPregnancies: async (_: unknown, __: unknown, context: Context) => {
      authCheck(context);
      womenOnlyCheck(context);

      return Pregnancy.find({ user: context.user!.id }).sort({ lastPeriodDate: -1 });
    },

    //WHERE THE ACTIVE PREGNANCY IS RIGHT NOW — powers the tracker screen
    pregnancyProgress: async (_: unknown, __: unknown, context: Context) => {
      authCheck(context);
      womenOnlyCheck(context);

      //only one pregnancy can be active at a time
      const pregnancy = await Pregnancy.findOne({ user: context.user!.id, endedAt: null });

      //nothing being tracked — the app shows the "start tracking" state
      if (!pregnancy) {
        return {
          active: false,
          pregnancy: null,
          dueDate: null,
          weeksPregnant: null,
          daysIntoWeek: null,
          trimester: null,
          daysUntilDue: null,
          overdue: false,
        };
      }

      const lastPeriodDate = pregnancy.get('lastPeriodDate');
      const today = todayIso();

      const dueDate = addDays(toDate(lastPeriodDate), GESTATION_DAYS);

      //gestational age is counted from the last period, not from conception
      const daysElapsed = daysBetween(lastPeriodDate, today);
      const weeksPregnant = Math.floor(daysElapsed / 7);
      const daysIntoWeek = daysElapsed % 7;

      const daysUntilDue = daysBetween(today, dueDate);

      return {
        active: true,
        pregnancy,
        dueDate,
        weeksPregnant,
        daysIntoWeek,
        trimester: trimesterFor(weeksPregnant),
        daysUntilDue,
        //past the due date without being ended yet — the app should nudge her to see a clinician
        overdue: daysUntilDue < 0,
      };
    },
  },

  Mutation: {
    //START TRACKING A PREGNANCY FROM THE LAST PERIOD DATE
    startPregnancy: async (_: unknown, { input }: StartPregnancyArgs, context: Context) => {
      authCheck(context);
      womenOnlyCheck(context);

      const { lastPeriodDate, note } = input

      try {
        if (!isValidPastDate(lastPeriodDate)) {
          throw new GraphQLError('Last period date must be a valid date that is not in the future', {
            extensions: { code: 'BAD_USER_INPUT' },
          });
        }

        //a pregnancy runs about 40 weeks — anything far past that is a typo
        if (daysBetween(lastPeriodDate, todayIso()) > 320) {
          throw new GraphQLError('That date is too far in the past to start a pregnancy', {
            extensions: { code: 'BAD_USER_INPUT' },
          });
        }

        //refuse a second active pregnancy so the progress query stays unambiguous
        const active = await Pregnancy.findOne({ user: context.user!.id, endedAt: null });

        if (active) {
          throw new GraphQLError('You already have a pregnancy being tracked', {
            extensions: { code: 'PREGNANCY_ALREADY_ACTIVE' },
          });
        }

        const pregnancy = new Pregnancy({ user: context.user!.id, lastPeriodDate, note });

        await pregnancy.save();

        return pregnancy;
      } catch (error: any) {
        if (error instanceof GraphQLError) {
          throw error;
        }

        throw new GraphQLError('Unexpected error while starting pregnancy', {
          extensions: { code: 'PREGNANCY_CREATE_FAILED' },
        });
      }
    },

    //CORRECT THE DATE OR NOTE ON A TRACKED PREGNANCY
    updatePregnancy: async (_: unknown, { id, input }: UpdatePregnancyArgs, context: Context) => {
      authCheck(context);
      womenOnlyCheck(context);

      const { lastPeriodDate, note } = input

      try {
        const pregnancy = await Pregnancy.findOne({ _id: id, user: context.user!.id });

        if (!pregnancy) {
          throw new GraphQLError('Pregnancy not found', {
            extensions: { code: 'PREGNANCY_NOT_FOUND' },
          });
        }

        if (lastPeriodDate !== undefined && !isValidPastDate(lastPeriodDate)) {
          throw new GraphQLError('Last period date must be a valid date that is not in the future', {
            extensions: { code: 'BAD_USER_INPUT' },
          });
        }

        //only update the fields the user actually sent
        if (lastPeriodDate !== undefined) pregnancy.set('lastPeriodDate', lastPeriodDate);
        if (note !== undefined) pregnancy.set('note', note);

        await pregnancy.save();

        return pregnancy;
      } catch (error: any) {
        if (error instanceof GraphQLError) {
          throw error;
        }

        throw new GraphQLError('Unexpected error while updating pregnancy', {
          extensions: { code: 'PREGNANCY_UPDATE_FAILED' },
        });
      }
    },

    //CLOSE A PREGNANCY — the record stays in her history either way
    endPregnancy: async (_: unknown, { id, input }: EndPregnancyArgs, context: Context) => {
      authCheck(context);
      womenOnlyCheck(context);

      const { endedAt, outcome, note } = input

      try {
        const pregnancy = await Pregnancy.findOne({ _id: id, user: context.user!.id });

        if (!pregnancy) {
          throw new GraphQLError('Pregnancy not found', {
            extensions: { code: 'PREGNANCY_NOT_FOUND' },
          });
        }

        if (pregnancy.get('endedAt')) {
          throw new GraphQLError('This pregnancy is already closed', {
            extensions: { code: 'PREGNANCY_ALREADY_ENDED' },
          });
        }

        const ended = endedAt ?? todayIso();

        if (!isValidPastDate(ended)) {
          throw new GraphQLError('End date must be a valid date that is not in the future', {
            extensions: { code: 'BAD_USER_INPUT' },
          });
        }

        //it can't have ended before it started
        if (ended < pregnancy.get('lastPeriodDate')) {
          throw new GraphQLError('End date cannot be before the last period date', {
            extensions: { code: 'BAD_USER_INPUT' },
          });
        }

        pregnancy.set('endedAt', ended);

        //outcome is optional on purpose — she never has to explain
        if (outcome !== undefined) pregnancy.set('outcome', outcome);
        if (note !== undefined) pregnancy.set('note', note);

        await pregnancy.save();

        return pregnancy;
      } catch (error: any) {
        if (error instanceof GraphQLError) {
          throw error;
        }

        //an out of enum outcome lands here
        if (error?.name === 'ValidationError') {
          throw new GraphQLError('Invalid pregnancy data', {
            extensions: { code: 'BAD_USER_INPUT' },
          });
        }

        throw new GraphQLError('Unexpected error while ending pregnancy', {
          extensions: { code: 'PREGNANCY_UPDATE_FAILED' },
        });
      }
    },

    //DELETE A RECORD OUTRIGHT — sensitive data, so she can always erase it
    removePregnancy: async (_: unknown, { id }: RemovePregnancyArgs, context: Context) => {
      authCheck(context);
      womenOnlyCheck(context);

      try {
        const deleted = await Pregnancy.findOneAndDelete({ _id: id, user: context.user!.id });

        if (!deleted) {
          throw new GraphQLError('Pregnancy not found', {
            extensions: { code: 'PREGNANCY_NOT_FOUND' },
          });
        }

        return true;
      } catch (error: any) {
        if (error instanceof GraphQLError) {
          throw error;
        }

        throw new GraphQLError('Unexpected error while removing pregnancy', {
          extensions: { code: 'PREGNANCY_DELETE_FAILED' },
        });
      }
    },
  },
};
