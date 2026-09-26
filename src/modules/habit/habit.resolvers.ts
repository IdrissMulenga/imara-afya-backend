import * as habitService from './habit.service.js';
import { withUser } from '../../shared/resolve.js';
import type { AddWaterInput, LogHabitsInput } from './habit.types.js';

export const habitResolvers = {
  Query: {
    habitSummary: withUser((user) => habitService.getSummary(user)),
    habitHistory: withUser((user, args: { days?: number | null }) =>
      habitService.getHistory(user, args.days)
    ),
  },

  Mutation: {
    logHabits: withUser((user, args: { input: LogHabitsInput }) =>
      habitService.logHabits(user, args.input)
    ),
    addWater: withUser((user, args: { input: AddWaterInput }) =>
      habitService.addWater(user, args.input)
    ),
  },
};
