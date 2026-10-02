import { createHash } from 'node:crypto';

//In-memory failure counters (per process), in a fixed window from the first failure.
//Keys are hashed, so the map never holds email addresses in plain text.

type Entry = { count: number; resetAt: number };

const hashed = (key: string): string => createHash('sha256').update(key).digest('hex').slice(0, 32);

export interface FailureCounter {
  //Seconds until the key may try again; 0 when it is not blocked.
  blockedFor: (key: string) => number;
  record: (key: string) => void;
  clear: (key: string) => void;
}

//Blocks a key for the rest of the window once it has failed max times.
export const createFailureCounter = (windowMs: number, max: number): FailureCounter => {
  const entries = new Map<string, Entry>();

  const sweeper = setInterval(
    () => {
      const now = Date.now();
      for (const [key, entry] of entries) {
        if (entry.resetAt <= now) entries.delete(key);
      }
    },
    5 * 60 * 1000
  );
  sweeper.unref();

  const live = (id: string): Entry | undefined => {
    const entry = entries.get(id);
    if (entry && entry.resetAt <= Date.now()) {
      entries.delete(id);
      return undefined;
    }
    return entry;
  };

  return {
    blockedFor: (key) => {
      const entry = live(hashed(key));
      if (!entry || entry.count < max) return 0;
      return Math.max(1, Math.ceil((entry.resetAt - Date.now()) / 1000));
    },
    record: (key) => {
      const id = hashed(key);
      const entry = live(id);
      if (entry) entry.count += 1;
      else entries.set(id, { count: 1, resetAt: Date.now() + windowMs });
    },
    clear: (key) => {
      entries.delete(hashed(key));
    },
  };
};
