import type { Request } from 'express';

//THE PER-REQUEST CONTEXT.
//
//Lives in the interfaces layer because it is transport vocabulary: an express
//request, an IP resolved through `trust proxy`, a bearer token. Use cases take
//plain arguments and never see any of it.

export interface AuthenticatedCaller {
  id: string;
  email: string;
  emailVerified: boolean;
  timezone: string;
  role: 'user' | 'admin';
}

export interface GraphQLContext {
  caller?: AuthenticatedCaller;
  ip: string;
  //Raw bearer token, kept in case token denylisting is ever added. Never logged.
  token?: string;
  request: Request;
  //Request start, so two resolvers in one query cannot disagree about the time.
  now: Date;
}

//`req.ip` is what express resolves through `trust proxy`. Reading
//x-forwarded-for directly would let any caller mint a fresh rate-limit budget
//per request by changing one header.
export const clientIp = (request: Request): string => request.ip ?? 'unknown';
