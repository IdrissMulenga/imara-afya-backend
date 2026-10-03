import * as insightService from './insight.service.js';
import { withUser } from '../../shared/resolve.js';

export const insightResolvers = {
  Query: {
    insights: withUser((user, args: { days?: number | null }) =>
      insightService.getInsights(user, args.days)
    ),
  },
};
