import type { Request } from 'express';
import type { IUser } from '../modules/user/user.model.js';

export interface Context {
  user?: IUser;
  //Time of the original sign-in, from the signed token.
  sessionOrigin?: string;
  ip: string;
  req: Request;
}
