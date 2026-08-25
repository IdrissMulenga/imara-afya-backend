import type { Request, Response, NextFunction } from "express"
import { envConf } from './../config/envConf.js';


//IN-MEMORY counters, one bucket per IP.
//
//This is deliberate for the first users: no Redis to run, no extra cost, and a
//single instance is all the traffic needs. It has two known limits — the counts
//reset when the process restarts, and they are NOT shared between instances.
//The moment a second instance is running, swap the Map for Redis; the shape of
//`hit()` below is what the Redis version should keep.
type Bucket = {
    count: number;
    //when this window expires, in ms since epoch
    resetAt: number;
};

const buckets = new Map<string, Bucket>();


//drop expired buckets so the Map can't grow forever
const sweep = (now: number) => {
    for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key);
    }
};

//sweep every 5 minutes rather than on every request
const SWEEP_MS = 5 * 60 * 1000;
const sweepTimer = setInterval(() => sweep(Date.now()), SWEEP_MS);

//never hold the process open just for the sweeper
sweepTimer.unref?.();


//COUNT ONE REQUEST AGAINST A KEY, returning what's left in this window.
//
//`peek` asks the same question without spending anything. That matters where
//only some outcomes should count: a login checks whether the account is already
//locked BEFORE it knows if the password is right, and charging for that check
//would mean successful logins counted towards a "too many failed attempts"
//limit — which is how someone locks themselves out of their own account.
export const hit = (
    key: string,
    windowMs: number,
    max: number,
    { peek = false } = {},
) => {
    const now = Date.now();
    const existing = buckets.get(key);

    if (!existing || existing.resetAt <= now) {
        if (peek) return { allowed: true, remaining: max, resetAt: now + windowMs };

        buckets.set(key, { count: 1, resetAt: now + windowMs });

        return { allowed: true, remaining: max - 1, resetAt: now + windowMs };
    }

    const count = peek ? existing.count : (existing.count += 1);

    return {
        allowed: count <= max,
        remaining: Math.max(max - count, 0),
        resetAt: existing.resetAt,
    };
};


//Forget a key's counter.
//
//For counters that exist to detect "this person has forgotten something" rather
//than to block an attacker: once they get it right, the slate is clean. Never
//call this from a path an unauthenticated caller can reach, or the limit it
//protects becomes trivially resettable.
export const clearHits = (key: string) => {
    buckets.delete(key);
};


//WHICH IP TO COUNT AGAINST.
//
//`req.ip`, and deliberately NOT the x-forwarded-for header.
//
//This used to read that header directly and take the leftmost value, which is
//the address the CLIENT put there. Anyone could send a different one on every
//request and get a fresh bucket each time — which quietly turned the login and
//signup limits into no limits at all, exactly where they matter most.
//
//Express already does this correctly: `app.set('trust proxy', 1)` in app.ts
//tells it there is one proxy in front, so it takes the LAST hop the header
//claims rather than the first, and that is the one our own proxy wrote.
const clientIp = (req: Request) => req.ip || req.socket.remoteAddress || 'unknown';


export const rateLimit = (
    { windowMs = envConf.RATE_LIMIT_WINDOW_MS, max = envConf.RATE_LIMIT_MAX, prefix = 'general' } = {},
) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const result = hit(`${prefix}:${clientIp(req)}`, windowMs, max);

        const retryAfter = Math.max(Math.ceil((result.resetAt - Date.now()) / 1000), 1);

        res.setHeader('X-RateLimit-Limit', String(max));
        res.setHeader('X-RateLimit-Remaining', String(result.remaining));

        if (!result.allowed) {
            res.setHeader('Retry-After', String(retryAfter));

            //plain HTTP error, not a GraphQL one — the request never reaches the schema
            res.status(429).json({
                errors: [{
                    message: 'Too many requests. Please wait a moment and try again.',
                    extensions: { code: 'RATE_LIMITED', retryAfter },
                }],
            });

            return;
        }

        next();
    };
};
