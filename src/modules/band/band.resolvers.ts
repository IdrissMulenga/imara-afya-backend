import * as bandService from './band.service.js';
import { withUser } from '../../shared/resolve.js';
import type { PairBandInput, SyncBandInput } from './band.types.js';

export const bandResolvers = {
  Query: {
    myBand: withUser((user) => bandService.getBand(user)),
  },

  Mutation: {
    pairBand: withUser((user, args: { input: PairBandInput }) =>
      bandService.pairBand(user, args.input)
    ),
    unpairBand: withUser((user) => bandService.unpairBand(user)),
    syncBand: withUser((user, args: { input: SyncBandInput }) =>
      bandService.syncBand(user, args.input)
    ),
  },
};
