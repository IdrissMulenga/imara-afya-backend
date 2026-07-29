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


//count one request against a key, returning what's left in this window
export const hit = (key: string, windowMs: number, max: number) => {
    const now = Date.now();
    const existing = buckets.get(key);

    if (!existing || existing.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, remaining: max - 1, resetAt: now + windowMs };
    }

    existing.count += 1;

    return {
        allowed: existing.count <= max,
        remaining: Math.max(max - existing.count, 0),
        resetAt: existing.resetAt,
    };
};


const clientIp = (req: Request) => {
    //behind a proxy (Render, Railway, nginx) the real IP is in x-forwarded-for
    const forwarded = req.headers['x-forwarded-for'];

    if (typeof forwarded === 'string' && forwarded.length) {
        return forwarded.split(',')[0].trim();
    }

    return req.ip || req.socket.remoteAddress || 'unknown';
};


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
