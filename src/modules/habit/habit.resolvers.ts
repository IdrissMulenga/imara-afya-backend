import * as habitService from './habit.service.js';
import { requireAuth } from '../../shared/auth-guard.js';
import { handleError } from '../../shared/errors.js';
import type { Context } from '../../shared/context.js';
import type { AddWaterInput, LogHabitsInput } from './habit.types.js';

export const habitResolvers = {
  Query: {
    habitSummary: async (_p: unknown, _a: unknown, context: Context) => {
      const caller = requireAuth(context);
      try {
        return await habitService.getSummary(caller);
      } catch (error) {
        throw handleError(error, 'habitSummary');
      }
    },

    habitHistory: async (_p: unknown, args: { days?: number | null }, context: Context) => {
      const caller = requireAuth(context);
      try {
        return await habitService.getHistory(caller, args.days);
      } catch (error) {
        throw handleError(error, 'habitHistory');
      }
    },
  },

  Mutation: {
    logHabits: async (_p: unknown, args: { input: LogHabitsInput }, context: Context) => {
      const caller = requireAuth(context);
      try {
        return await habitService.logHabits(caller, args.input);
      } catch (error) {
        throw handleError(error, 'logHabits');
      }
    },

    addWater: async (_p: unknown, args: { input: AddWaterInput }, context: Context) => {
      const caller = requireAuth(context);
      try {
        return await habitService.addWater(caller, args.input);
      } catch (error) {
        throw handleError(error, 'addWater');
      }
    },
  },
};
