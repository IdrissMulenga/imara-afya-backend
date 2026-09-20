import { UserModel } from '../schemas/user.schema.js';
import { toUser } from '../mappers/auth.mappers.js';
import type { User } from '../../../../domain/auth/entities/user.entity.js';
import type { UserRepository } from '../../../../domain/auth/repositories/user.repository.js';

//THE USER REPOSITORY, AGAINST MONGOOSE.
//
//The only file in the codebase that knows a user is stored in a collection
//called `users`. Every query shape stays behind this boundary.

export const mongoUserRepository: UserRepository = {
  findById: async (id) => {
    //An id that is not a valid ObjectId would make mongoose throw a CastError
    //rather than return nothing. "Not found" is the honest answer.
    if (!/^[0-9a-fA-F]{24}$/.test(id)) return null;
    const doc = await UserModel.findById(id);
    return doc ? toUser(doc) : null;
  },

  findByEmail: async (email) => {
    const doc = await UserModel.findOne({ email });
    return doc ? toUser(doc) : null;
  },

  existsByEmail: async (email) => (await UserModel.exists({ email })) !== null,

  create: async ({ email, passwordHash }) => {
    const doc = await UserModel.create({ email, passwordHash });
    return toUser(doc);
  },

  //Writes back whatever the entity's rules changed. `$set` with the snapshot
  //rather than a full document replace, so fields this layer does not know
  //about are left alone.
  save: async (user: User) => {
    const { id, createdAt: _createdAt, ...fields } = user.snapshot;
    await UserModel.updateOne({ _id: id }, { $set: fields });
  },

  deleteById: async (id) => {
    await UserModel.deleteOne({ _id: id });
  },
};
