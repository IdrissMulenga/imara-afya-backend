import * as weightService from './weight.service.js';
import { withUser } from '../../shared/resolve.js';
import type { LogWeightInput } from './weight.types.js';

export const weightResolvers = {
  Query: {
    weightHistory: withUser((user, args: { days?: number | null }) =>
      weightService.getHistory(user, args.days)
    ),
  },

  Mutation: {
    logWeight: withUser((user, args: { input: LogWeightInput }) =>
      weightService.logWeight(user, args.input)
    ),
    deleteWeight: withUser((user, args: { day: string }) =>
      weightService.deleteWeight(user, args.day)
    ),
  },
};
