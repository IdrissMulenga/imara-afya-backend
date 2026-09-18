import type { Request } from 'express';
import type { Types } from 'mongoose';

//THE PER-REQUEST CONTEXT.
//
//Deliberately small: who is calling, where from, and when. Anything that can
//be derived is derived at the point of use rather than precomputed for every
//request, including the ones that never look at it.
//
//`user` is populated by the auth module's context builder. It is optional
//here, and the ONLY sanctioned way to read it is through the guards in
//core/resolver.ts — reading `context.user` directly is how an unauthenticated
//path gets shipped by accident.

export interface AuthenticatedUser {
  id: string;
  _id: Types.ObjectId;
  email: string;
  emailVerified: boolean;
  timezone: string;
  role: 'user' | 'admin';
}

export interface Context {
  user?: AuthenticatedUser;
  ip: string;
  //Raw bearer token, kept for logout so it can be matched if token denylisting
  //is ever added. Never logged.
  token?: string;
  request: Request;
  //Request start, for timing-sensitive logic that must not call Date.now()
  //twice and get two different answers mid-resolver.
  now: Date;
}

//`req.ip` is what express resolves through `trust proxy`. Reading
//x-forwarded-for directly would let any caller mint a fresh rate-limit budget
//per request by changing one header.
export const clientIp = (request: Request): string => request.ip ?? 'unknown';
