import jwt from "jsonwebtoken"
import { envConf } from './../config/envConf.js';
import { GraphQLError } from "graphql"
import User from "../models/user.js"
import type { Context } from "../graphql/context.js"

//pin the algorithm on both sides. Verifying without this lets an attacker pick
//the algorithm in the token header, which is the classic JWT confusion attack.
const JWT_ALGORITHM = 'HS256' as const;
const JWT_ISSUER = 'imara-afya';

//HOW LONG A SLIDING SESSION MAY LIVE.
//
//`refreshSession` swaps a valid token for a fresh one, so someone who opens the
//app every few days never sees a login screen. Left unbounded that would also
//let a STOLEN token be renewed forever, so every token carries `o` — the moment
//the password was actually typed — and renewal stops once that is 30 days old.
//After that the password is required again, whoever is holding the phone.
export const MAX_SESSION_DAYS = 30;

const nowInSeconds = () => Math.floor(Date.now() / 1000);


//`v` is the user's tokenVersion at the moment of issue. context.ts compares it
//against the current value and rejects the token if the user has since logged
//out or changed their password.
//
//`o` is the session origin, carried forward unchanged by every renewal. Pass it
//when refreshing; leave it out when the user has just proved who they are.
export const generateToken = (userId: string, tokenVersion = 0, origin?: number) => {
    try {
        return jwt.sign(
            { id: userId, v: tokenVersion, o: origin ?? nowInSeconds() },
            envConf.JWT_SECRET,
            {
                expiresIn: '7d',
                algorithm: JWT_ALGORITHM,
                issuer: JWT_ISSUER,
            },
        );
    } catch {
        throw new GraphQLError('Failed to generate auth token', {
            extensions: { code: 'TOKEN_GENERATION_FAILED' },
        });
    }
}


//has this session been running on one password entry for too long?
export const sessionExpired = (origin: number) =>
    nowInSeconds() - origin > MAX_SESSION_DAYS * 24 * 60 * 60;


//RETIRE EVERY TOKEN THIS ACCOUNT HAS ISSUED.
//
//Atomic, and deliberately not `user.set('tokenVersion', current + 1)` followed
//by a save. That reads the number into node, adds one there, and writes the
//result back — so two requests that both read 3 both write 4, and one of the
//two increments is simply lost. `$inc` does the addition inside the database,
//where the two cannot interleave.
//
//Losing an increment happens to be survivable today: everything that bumps this
//number wants the same outcome ("tokens older than now are dead"), and 4 still
//delivers that. But this counter is the whole revocation mechanism — it is what
//makes "log out" mean something on a stolen phone — and it should not depend on
//a subtle argument about which callers happen to agree with each other.
//
//Returns the authoritative new version, since the caller usually needs to mint
//a replacement token carrying it.
export const revokeTokens = async (userId: string) => {
    const updated = await User.findByIdAndUpdate(
        userId,
        { $inc: { tokenVersion: 1 } },
        { new: true, select: 'tokenVersion' },
    );

    if (!updated) {
        throw new GraphQLError('User not found', {
            extensions: { code: 'USER_NOT_FOUND' },
        });
    }

    return updated.get('tokenVersion') as number;
};

export const verifyToken = (token: string) => {
    try {
        return jwt.verify(token, envConf.JWT_SECRET, {
            //only accept the algorithm we actually issue
            algorithms: [JWT_ALGORITHM],
            issuer: JWT_ISSUER,
        });
    } catch {
        throw new GraphQLError('Invalid or expired token', {
            extensions: { code: 'UNAUTHENTICATED' },
        });
    }
}


export const authCheck = (context: Context) => {
    if (!context.user) {
        throw new GraphQLError('User not authenticated', {
            extensions: { code: 'UNAUTHENTICATED' },
        });
    }
};


export const premiumCheck = (context: Context) => {
    //must be logged in and on the premium plan to use premium features
    if (!context.user || context.user.get('plan') !== 'premium') {
        throw new GraphQLError('This feature requires a premium plan', {
            extensions: { code: 'PREMIUM_REQUIRED' },
        });
    }
};


export const adminCheck = (context: Context) => {
    //content that every user reads (the guidance library) is admin-only to write
    if (!context.user || context.user.get('role') !== 'admin') {
        throw new GraphQLError('This action requires an admin account', {
            extensions: { code: 'ADMIN_REQUIRED' },
        });
    }
};


export const womenOnlyCheck = (context: Context) => {
    //period tracking is only available for users whose gender is Woman
    if (!context.user || context.user.get('gender') !== 'Woman') {
        throw new GraphQLError('This feature is only available for women', {
            extensions: { code: 'WOMEN_ONLY' },
        });
    }
};