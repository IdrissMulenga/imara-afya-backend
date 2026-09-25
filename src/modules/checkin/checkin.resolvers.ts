import * as checkInService from './checkin.service.js';
import { requireAuth } from '../../shared/auth-guard.js';
import { handleError } from '../../shared/errors.js';
import type { Context } from '../../shared/context.js';
import type { LogCheckInInput } from './checkin.types.js';

export const checkInResolvers = {
  Query: {
    checkInSummary: async (_p: unknown, _a: unknown, context: Context) => {
      const caller = requireAuth(context);
      try {
        return await checkInService.getSummary(caller);
      } catch (error) {
        throw handleError(error, 'checkInSummary');
      }
    },

    checkInHistory: async (_p: unknown, args: { days?: number | null }, context: Context) => {
      const caller = requireAuth(context);
      try {
        return await checkInService.getHistory(caller, args.days);
      } catch (error) {
        throw handleError(error, 'checkInHistory');
      }
    },
  },

  Mutation: {
    logCheckIn: async (_p: unknown, args: { input: LogCheckInInput }, context: Context) => {
      const caller = requireAuth(context);
      try {
        return await checkInService.logCheckIn(caller, args.input);
      } catch (error) {
        throw handleError(error, 'logCheckIn');
      }
    },

    deleteCheckIn: async (_p: unknown, args: { day?: string | null }, context: Context) => {
      const caller = requireAuth(context);
      try {
        return await checkInService.deleteCheckIn(caller, args.day);
      } catch (error) {
        throw handleError(error, 'deleteCheckIn');
      }
    },
  },
};
