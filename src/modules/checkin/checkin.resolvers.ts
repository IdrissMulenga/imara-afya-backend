import * as checkInService from './checkin.service.js';
import { withUser } from '../../shared/resolve.js';
import type { LogCheckInInput } from './checkin.types.js';

export const checkInResolvers = {
  Query: {
    checkInSummary: withUser((user) => checkInService.getSummary(user)),
    checkInHistory: withUser((user, args: { days?: number | null }) =>
      checkInService.getHistory(user, args.days)
    ),
  },

  Mutation: {
    logCheckIn: withUser((user, args: { input: LogCheckInInput }) =>
      checkInService.logCheckIn(user, args.input)
    ),
    deleteCheckIn: withUser((user, args: { id: string }) =>
      checkInService.deleteCheckIn(user, args.id)
    ),
  },
};
