import type { Request } from 'express';
import type { IUser } from '../modules/user/user.model.js';

//THE CONTEXT.
//
//Built once per request in app.ts and handed to every resolver as its third
//argument. This is the one type every module shares.

export interface Context {
  //Set when the request carried a valid token. Undefined for public fields
  //like login and signup.
  user?: IUser;
  //WHEN THE PASSWORD WAS LAST TYPED, read out of the SIGNED token — never off a
  //header. refreshSession uses it to enforce the absolute session cap, so a
  //caller able to set this could renew a stolen session forever.
  sessionOrigin?: string;
  //Resolved by express through `trust proxy`. The rate limiters key on it.
  ip: string;
  req: Request;
}
