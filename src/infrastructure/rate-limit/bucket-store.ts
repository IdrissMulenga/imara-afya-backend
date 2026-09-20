import { createHash } from 'node:crypto';

//IN-MEMORY RATE-LIMIT BUCKETS.
//
//Infrastructure, not policy: this file knows how to COUNT. The interfaces
//layer decides what to count and how much is allowed.
//
//Deliberate for the first users: no Redis to run, no extra cost, and a single
//instance is all the traffic needs. Two known limits come with it — counts
//reset when the process restarts, and they are NOT shared between instances.
//
//The moment a second instance runs, swap the Map for Redis. `hit()` keeps its
//signature and nothing that calls it has to change.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

const sweep = (now: number): void => {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
};

//Sweep every five minutes rather than on every request. `unref` so a pending
//timer never holds the process open during a graceful shutdown.
const SWEEP_MS = 5 * 60 * 1000;
const sweepTimer = setInterval(() => sweep(Date.now()), SWEEP_MS);
sweepTimer.unref();

export interface HitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export const hit = (key: string, windowMs: number, max: number): HitResult => {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: max - 1, retryAfterSeconds: 0 };
  }

  bucket.count += 1;

  if (bucket.count > max) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  return { allowed: true, remaining: max - bucket.count, retryAfterSeconds: 0 };
};

//Keys that contain an email are hashed, so the in-memory map never holds a
//plaintext address that a heap dump would expose.
export const bucketKey = (...parts: string[]): string =>
  createHash('sha256').update(parts.join(':')).digest('hex').slice(0, 32);

//Test seam: lets a test reset state without restarting the process.
export const resetBuckets = (): void => buckets.clear();
