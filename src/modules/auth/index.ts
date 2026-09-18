import { defineModule } from '../../core/module.js';
import { types, queries, mutations } from './auth.typeDefs.js';
import { resolvers } from './auth.resolvers.js';
import { Otp } from './models/otp.model.js';
import { TrustedDevice } from './models/trustedDevice.model.js';

//THE AUTH MODULE.
//
//One object. The schema builder reads its SDL, the resolver barrel reads its
//resolvers, and account deletion reads its owned models. Nothing else in the
//codebase needs to be told this module exists.

export default defineModule({
  name: 'auth',
  typeDefs: { types, queries, mutations },
  resolvers,
  //Both hold rows keyed to a user, so both are erased on account deletion.
  //Leaving one out here is what assertPurgeCoverage() refuses to boot over.
  ownedModels: [Otp, TrustedDevice] as never,
});
