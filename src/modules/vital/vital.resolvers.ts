import * as vitalService from './vital.service.js';
import { withUser } from '../../shared/resolve.js';
import type { LogVitalInput, VitalKind } from './vital.types.js';

export const vitalResolvers = {
  Query: {
    vitals: withUser((user, args: { days?: number | null; kind?: VitalKind | null }) =>
      vitalService.getHistory(user, args.days, args.kind)
    ),
    vitalSummary: withUser((user) => vitalService.getSummary(user)),
  },

  Mutation: {
    logVital: withUser((user, args: { input: LogVitalInput }) =>
      vitalService.logVital(user, args.input)
    ),
    deleteVital: withUser((user, args: { id: string }) => vitalService.deleteVital(user, args.id)),
  },
};
