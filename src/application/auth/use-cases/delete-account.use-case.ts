import { DomainError } from '../../../domain/shared/errors/domain.error.js';
import { ErrorCode } from '../../../domain/shared/errors/error-codes.js';
import type { UserRepository } from '../../../domain/auth/repositories/user.repository.js';
import type { Hasher } from '../ports/hasher.port.js';
import { loadUser } from './shared.js';

//ERASE AN ACCOUNT AND EVERYTHING IT OWNS.
//
//`purgers` is the list of "delete this user's rows" functions each feature
//registers. The failure mode of forgetting one is silent and permanent:
//personal health data left in the database after the user asked for it to be
//gone. That is a data-protection problem, not a tidiness one, so the
//composition root asserts coverage at boot and refuses to start on a gap.

export type UserDataPurger = (userId: string) => Promise<void>;

export interface DeleteAccountDeps {
  users: UserRepository;
  hasher: Hasher;
  purgers: UserDataPurger[];
}

export const makeDeleteAccount =
  (deps: DeleteAccountDeps) =>
  async (input: { userId: string; password: string }): Promise<boolean> => {
    const user = await loadUser(deps.users, input.userId);

    //The password is required even though the caller holds a valid session. A
    //phone left unlocked on a table should not be one tap from erasing
    //someone's health history.
    if (!(await deps.hasher.compare(input.password, user.passwordHash))) {
      throw new DomainError(ErrorCode.WRONG_PASSWORD, 'That password is not right.');
    }

    //Owned rows first, the account last. In that order a failure part-way
    //leaves an account with some data missing — recoverable, and the user can
    //try again. The reverse leaves orphaned health data with no account to
    //delete it from, which nothing can clean up.
    for (const purge of deps.purgers) {
      await purge(user.id);
    }

    await deps.users.deleteById(user.id);
    return true;
  };
