//RANDOMNESS.
//
//A port so the one-time code generator can be made deterministic in a test.
//The production implementation MUST use a cryptographic source — Math.random
//is seeded predictably and a sequence of its outputs can be reconstructed,
//which for a six-digit login code is the whole ballgame.

export interface RandomSource {
  //Uniform integer in [0, maxExclusive).
  int(maxExclusive: number): number;
}
