import type { Request, Response } from 'express';
import { translate } from './messages.js';

type Extensions = { code: string } & Record<string, unknown>;

//Sends a translated error from a plain express route, shaped like a GraphQL error.
export const sendError = (
  req: Request,
  res: Response,
  status: number,
  extensions: Extensions,
  message: string
): void => {
  const localized = translate(message, extensions, req.headers['accept-language']);
  res.status(status).json({ errors: [{ message: localized, extensions }] });
};
