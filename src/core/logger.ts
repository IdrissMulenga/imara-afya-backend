import { env } from '../config/env.js';

//STRUCTURED LOGGING, NO DEPENDENCY.
//
//JSON lines in production so a log aggregator can parse them; plain readable
//lines in development so a human can. No pino, no winston: this is four
//functions, and a logging library is a thing to keep patched forever.
//
//NEVER log a token, a password, a one-time code or a raw email address. The
//`redact` helper below is the only sanctioned way to put user-identifying
//material in a log line.

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN_LEVEL: Level = env.IS_PRODUCTION ? 'info' : 'debug';

const write = (level: Level, message: string, meta?: Record<string, unknown>) => {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return;

  if (env.IS_PRODUCTION) {
    process.stdout.write(
      `${JSON.stringify({ level, time: new Date().toISOString(), message, ...meta })}\n`
    );
    return;
  }

  const tail = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  process.stdout.write(`[${level.toUpperCase()}] ${message}${tail}\n`);
};

//Turn identifying material into something safe to log: an email becomes
//"i***s@gmail.com", anything else keeps its first two characters.
export const redact = (value: string | undefined | null): string => {
  if (!value) return '(none)';
  const at = value.indexOf('@');
  if (at > 0) {
    const name = value.slice(0, at);
    const domain = value.slice(at);
    const head = name.slice(0, 1);
    const tail = name.length > 2 ? name.slice(-1) : '';
    return `${head}***${tail}${domain}`;
  }
  return `${value.slice(0, 2)}***`;
};

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => write('debug', message, meta),
  info: (message: string, meta?: Record<string, unknown>) => write('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => write('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => write('error', message, meta),
};
