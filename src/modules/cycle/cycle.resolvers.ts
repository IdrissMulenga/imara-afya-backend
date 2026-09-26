import * as cycleService from './cycle.service.js';
import { withUser } from '../../shared/resolve.js';
import type { CycleDayInput } from './cycle.types.js';

export const cycleResolvers = {
  Query: {
    cycleSummary: withUser((user) => cycleService.getSummary(user)),
    cycleDays: withUser((user, args: { from: string; to: string }) =>
      cycleService.getDays(user, args.from, args.to)
    ),
  },

  Mutation: {
    startPeriod: withUser((user, args: { day?: string | null }) =>
      cycleService.startPeriod(user, args.day)
    ),
    endPeriod: withUser((user, args: { day?: string | null }) =>
      cycleService.endPeriod(user, args.day)
    ),
    deletePeriod: withUser((user, args: { id: string }) =>
      cycleService.deletePeriod(user, args.id)
    ),
    logCycleDay: withUser((user, args: { input: CycleDayInput }) =>
      cycleService.logDay(user, args.input)
    ),
  },
};
