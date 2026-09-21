//THE AUTH MODULE.
//
//The two things modules/index.ts needs. Everything else in this folder —
//services, models, token signing — stays inside it.

export { authTypeDefs as typeDefs } from './auth.typeDefs.js';
export { authResolvers as resolvers } from './auth.resolvers.js';

//Exported because user.service.ts erases these two collections when an account
//is deleted, and middleware/auth.ts needs verifyToken.
export { Otp } from './otp.model.js';
export { Device } from './device.model.js';
export { verifyToken } from './token.service.js';
