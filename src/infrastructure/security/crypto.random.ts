import { randomInt } from 'node:crypto';
import type { RandomSource } from '../../application/auth/ports/random.port.js';

//THE RANDOM PORT, BACKED BY THE PLATFORM CSPRNG.
//
//node:crypto, never Math.random. Math.random is seeded predictably and a
//sequence of its outputs can be reconstructed — for a six-digit login code
//that is the whole ballgame.

export const cryptoRandom: RandomSource = {
  int: (maxExclusive) => randomInt(0, maxExclusive),
};
