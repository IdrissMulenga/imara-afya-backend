import Pregnancy from './../../models/pregnancy.js';
import type { Context } from "../context.js"
import { authCheck, womenOnlyCheck } from './../../services/authServices.js';
import { GraphQLError } from 'graphql';
import type { StartPregnancyArgs, UpdatePregnancyArgs, EndPregnancyArgs, RemovePregnancyArgs } from "../../utils/types.js"
import { LIMITS } from "../../utils/limits.js"
import { addDays, daysBetween } from "../../utils/datetime.js"
import { assertPastDate, rethrow, userToday } from "../../utils/resolverHelpers.js"


//Date maths and the "not in the future" check are shared — this file used to
//carry its own copies, built on a UTC "today". A due date is counted in days
//from the last period, so being a day out matters.

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

      return Pregnancy.find({ user: context.user!.id }).sort({ lastPeriodDate: -1 }).limit(LIMITS.pregnancies);
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
      //her calendar, not the server's
      const today = userToday(context);

      const dueDate = addDays(lastPeriodDate, GESTATION_DAYS);

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
        assertPastDate(lastPeriodDate, userToday(context), 'Last period date');

        //a pregnancy runs about 40 weeks — anything far past that is a typo
        if (daysBetween(lastPeriodDate, userToday(context)) > 320) {
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
      } catch (error) {
        throw rethrow(
          error, 'Unexpected error while starting pregnancy', 'PREGNANCY_CREATE_FAILED',
        );
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

        if (lastPeriodDate !== undefined) {
          assertPastDate(lastPeriodDate, userToday(context), 'Last period date');
        }

        //only update the fields the user actually sent
        if (lastPeriodDate !== undefined) pregnancy.set('lastPeriodDate', lastPeriodDate);
        if (note !== undefined) pregnancy.set('note', note);

        await pregnancy.save();

        return pregnancy;
      } catch (error) {
        throw rethrow(
          error, 'Unexpected error while updating pregnancy', 'PREGNANCY_UPDATE_FAILED',
        );
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

        const ended = endedAt ?? userToday(context);

        assertPastDate(ended, userToday(context), 'End date');

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
      } catch (error) {
        //an out of enum outcome lands here
        throw rethrow(
          error, 'Unexpected error while ending pregnancy', 'PREGNANCY_UPDATE_FAILED',
          'Invalid pregnancy data',
        );
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
      } catch (error) {
        throw rethrow(
          error, 'Unexpected error while removing pregnancy', 'PREGNANCY_DELETE_FAILED',
        );
      }
    },
  },
};
