import bcrypt from 'bcryptjs';
import type { IUser } from '../modules/user/index.js';

const ROUNDS = 12;

//Hashes a password with bcrypt.
export const hashPassword = (password: string): Promise<string> => bcrypt.hash(password, ROUNDS);

//True when the password matches the user's hash; false when the account has no password.
export const passwordMatches = async (
  user: Pick<IUser, 'passwordHash'>,
  password: string
): Promise<boolean> => (user.passwordHash ? bcrypt.compare(password, user.passwordHash) : false);

//Sets a new password and signs out every device (tokenVersion goes up).
export const setPassword = async (user: IUser, password: string): Promise<void> => {
  user.passwordHash = await hashPassword(password);
  user.tokenVersion += 1;
  user.failedPasswordAttempts = 0;
  await user.save();
};
