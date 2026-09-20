import mongoose from 'mongoose';

import { authPolicy } from './infrastructure/config/auth-policy.config.js';
import { logger, redact } from './infrastructure/logging/logger.js';
import { bcryptHasher } from './infrastructure/security/bcrypt.hasher.js';
import { jwtTokenService } from './infrastructure/security/jwt.token.service.js';
import { cryptoRandom } from './infrastructure/security/crypto.random.js';
import { resendMailService } from './infrastructure/mail/resend.mail.service.js';
import { mongoUserRepository } from './infrastructure/database/mongoose/repositories/user.repository.impl.js';
import { mongoOtpRepository } from './infrastructure/database/mongoose/repositories/otp.repository.impl.js';
import { mongoTrustedDeviceRepository } from './infrastructure/database/mongoose/repositories/trusted-device.repository.impl.js';

import { systemClock } from './application/auth/ports/clock.port.js';
import { createAuthUseCases, type AuthUseCases } from './application/auth/index.js';
import type { UserDataPurger } from './application/auth/use-cases/delete-account.use-case.js';

import { buildSchema } from './interfaces/graphql/schema.builder.js';
import { makeAuthenticate } from './interfaces/graphql/authenticate.js';
import { createAuthFeature } from './interfaces/graphql/auth/auth.resolvers.js';

//THE COMPOSITION ROOT.
//
//The ONE place in the codebase where concrete implementations meet the
//interfaces that describe them. Everything above this file depends on ports;
//this file decides that the hasher is bcrypt, the store is MongoDB and the
//mail provider is Resend.
//
//No DI container, no decorators, no reflection. Explicit wiring in one
//readable function — a small team can follow it, and nothing is resolved by
//magic at runtime.
//
//Swapping an implementation means changing a line here and nowhere else.

//"ERASE THIS USER'S ROWS", ONE PER FEATURE.
//
//Account deletion runs every entry. The failure mode of forgetting one is
//silent and permanent: personal health data left behind after the user asked
//for it to be gone. `assertPurgeCoverage` below refuses to boot on a gap, so
//that mistake cannot reach production.
const purgers: { name: string; purge: UserDataPurger }[] = [
  { name: 'Otp', purge: (userId) => mongoOtpRepository.deleteAllForUser(userId) },
  {
    name: 'TrustedDevice',
    purge: (userId) => mongoTrustedDeviceRepository.deleteAllForUser(userId),
  },
];

//Models that legitimately have no `user` field: shared content, and the user
//document itself, which deletion handles directly.
const PURGE_EXEMPT = new Set(['User']);

//Compares the registered purgers against every model mongoose knows about.
//Any model with a `user` path holds per-user rows by definition, so one that
//is unaccounted for is a deletion gap.
export const assertPurgeCoverage = (): void => {
  const registered = new Set(purgers.map((entry) => entry.name));
  const missing: string[] = [];

  for (const [name, model] of Object.entries(mongoose.models)) {
    if (PURGE_EXEMPT.has(name) || registered.has(name)) continue;
    if (model.schema.path('user')) missing.push(name);
  }

  if (missing.length > 0) {
    throw new Error(
      `These models hold user-owned data but nothing erases them on account deletion: ` +
        `${missing.join(', ')}. Register a purger in container.ts.`
    );
  }

  logger.info('Account deletion coverage verified', { purgers: registered.size });
};

export interface Container {
  authUseCases: AuthUseCases;
  schema: ReturnType<typeof buildSchema>;
  authenticate: ReturnType<typeof makeAuthenticate>;
}

export const createContainer = (): Container => {
  const authUseCases = createAuthUseCases({
    //--- storage ---
    users: mongoUserRepository,
    otps: mongoOtpRepository,
    devices: mongoTrustedDeviceRepository,

    //--- adapters ---
    hasher: bcryptHasher,
    tokens: jwtTokenService,
    mail: resendMailService,
    clock: systemClock,
    random: cryptoRandom,

    policy: authPolicy,
    purgers: purgers.map((entry) => entry.purge),

    //Reporting hooks. The application layer says what happened; this is where
    //it becomes a log line, which is why no use case imports a logger.
    onDeliveryFailure: ({ purpose, error }) =>
      logger.warn('Code issued but not delivered', {
        purpose,
        error: error instanceof Error ? error.message : String(error),
      }),

    onResetSuppressed: ({ reason, email }) =>
      logger.info('Reset request answered without sending', {
        reason,
        email: email ? redact(email) : '(none)',
      }),
  });

  //Every GraphQL feature. Adding one is a line here plus its folder under
  //interfaces/graphql/.
  const schema = buildSchema([createAuthFeature(authUseCases)]);

  const authenticate = makeAuthenticate({
    users: mongoUserRepository,
    tokens: jwtTokenService,
  });

  return { authUseCases, schema, authenticate };
};
