//THE USER MODULE.
//
//Everything the rest of the app needs from this folder. modules/index.ts
//imports these two and nothing else.

export { userTypeDefs as typeDefs } from './user.typeDefs.js';
export { userResolvers as resolvers } from './user.resolvers.js';

//Other modules import the model from here rather than reaching into the
//folder — auth needs it to find and update users.
export { User, type IUser } from './user.model.js';
