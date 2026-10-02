import type { Request } from 'express';
import type { GraphQLError } from 'graphql';
import type { IUser } from '../modules/user/index.js';

export interface Context {
  user?: IUser;
  //Time of the original sign-in, from the signed token.
  sessionOrigin?: string;
  //The device the session was signed in on, from the signed token.
  sessionDeviceId?: string;
  //Why the bearer token was rejected; thrown only by resolvers that need a user.
  authError?: GraphQLError;
  ip: string;
  req: Request;
}
