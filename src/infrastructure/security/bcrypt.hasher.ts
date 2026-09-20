import bcrypt from 'bcryptjs';
import type { Hasher } from '../../application/auth/ports/hasher.port.js';

//THE HASHER PORT, IMPLEMENTED WITH BCRYPT.
//
//Swapping to argon2 means writing one more file like this one. No use case
//changes, because none of them has ever imported bcrypt.

const DEFAULT_ROUNDS = 12;

//A hash to compare against when no user was found. Computed once at module
//load so the cost is not paid per request, and so the comparison that runs on
//an unknown email takes the same time as a real one.
const DUMMY_HASH = bcrypt.hashSync('imara-afya-timing-equaliser', DEFAULT_ROUNDS);

export const bcryptHasher: Hasher = {
  hash: (plaintext, rounds = DEFAULT_ROUNDS) => bcrypt.hash(plaintext, rounds),

  compare: (plaintext, hash) => bcrypt.compare(plaintext, hash),

  //The result is deliberately discarded. The point is the time spent, not the
  //answer — see the note on the port.
  compareWithDummy: async (plaintext) => {
    await bcrypt.compare(plaintext, DUMMY_HASH);
  },
};
