import bcrypt from 'bcryptjs';
import mongoose, { type Model } from 'mongoose';
import { User } from '../models/user.model.js';
import { AppError } from '../../../core/errors/AppError.js';
import { ErrorCode } from '../../../core/errors/codes.js';
import { logger, redact } from '../../../core/logger.js';

//ACCOUNT DELETION, AND THE GUARD THAT KEEPS IT HONEST.
//
//Deleting an account must remove every row that belongs to it. The failure
//mode is silent and permanent: a model added later but never registered here
//leaves personal health data in the database after the user asked for it to be
//gone. That is a data-protection problem, not a tidiness one.
//
//So the registry is not a list someone maintains by hand. Modules declare
//their owned models, `assertPurgeCoverage()` compares that against every
//model mongoose knows about, and the server REFUSES TO BOOT on a mismatch.
//A developer who forgets finds out in five seconds, not after a support email.

const ownedModels = new Set<Model<never>>();

export const registerOwnedModels = (models: Model<never>[] = []): void => {
  for (const model of models) ownedModels.add(model);
};

//Models that legitimately have no `user` field: shared content, and the user
//document itself, which deletion handles directly.
const EXEMPT = new Set(['User']);

export const assertPurgeCoverage = (): void => {
  const registered = new Set([...ownedModels].map((model) => model.modelName));
  const missing: string[] = [];

  for (const [name, model] of Object.entries(mongoose.models)) {
    if (EXEMPT.has(name) || registered.has(name)) continue;
    //A model with a `user` path holds per-user rows by definition.
    if (model.schema.path('user')) missing.push(name);
  }

  if (missing.length > 0) {
    throw new Error(
      `These models hold user-owned data but are not registered for account deletion: ` +
        `${missing.join(', ')}. Add them to the module's ownedModels array.`
    );
  }

  logger.info('Account deletion coverage verified', { models: registered.size });
};

export const deleteAccount = async (input: {
  userId: string;
  password: string;
}): Promise<boolean> => {
  const user = await User.findById(input.userId);
  if (!user) throw new AppError(ErrorCode.ACCOUNT_NOT_FOUND, 'That account no longer exists.');

  //The password is required even though the caller holds a valid session. A
  //phone left unlocked on a table should not be one tap from erasing someone's
  //health history.
  if (!(await bcrypt.compare(input.password, user.passwordHash))) {
    throw new AppError(ErrorCode.WRONG_PASSWORD, 'That password is not right.');
  }

  //Owned rows first, the account last. In that order a failure part-way leaves
  //an account with some data missing — recoverable, and the user can try
  //again. The reverse order leaves orphaned health data with no account to
  //delete it from, which nothing can clean up.
  for (const model of ownedModels) {
    await model.deleteMany({ user: user._id } as never);
  }

  await User.deleteOne({ _id: user._id });

  logger.info('Account deleted', { email: redact(user.email) });
  return true;
};
