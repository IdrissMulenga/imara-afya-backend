import type { Plugin } from "graphql-yoga"
import { GraphQLError, getOperationAST, Kind, type OperationDefinitionNode } from "graphql"
import type { Context } from "./../graphql/context.js"
import { hit } from './rateLimit.js';


//PER-OPERATION RATE LIMITING.
//
//The IP limiter in rateLimit.ts counts HTTP requests, which for GraphQL is
//almost meaningless: every operation we expose arrives at the same URL, so
//`careMap` and `login` and `logHabit` all spend from one budget. One POST can
//also carry several fields at once.
//
//This plugin counts the FIELDS actually executed, so the expensive and the
//abusable can be limited on their own terms without throttling normal use.
//
//It shares the in-memory buckets in rateLimit.ts, and inherits the same two
//limits: counts reset on restart, and they are not shared between instances.
//Swap `hit()` for Redis before running a second instance — nothing here changes.


type Budget = {
    windowMs: number;
    max: number;
};

//An operation may carry more than one budget. A burst window stops a stuck
//retry loop or a tapped-twice button hammering us within seconds, while the
//longer window is what actually caps sustained abuse. Both must pass.
type Rule = Budget[];

const seconds = (n: number) => n * 1000;
const minutes = (n: number) => n * 60 * 1000;
const hours = (n: number) => n * 60 * 60 * 1000;


//WHAT COUNTS AS EXPENSIVE OR ABUSABLE.
//
//Anything not listed here falls through to DEFAULT_READ / DEFAULT_WRITE, so a
//new field is limited from the day it ships rather than the day we remember.
const RULES: Record<string, Rule> = {
    //--------------------------- credentials ---------------------------
    //Slow enough that guessing passwords is pointless, generous enough that a
    //shared connection in an internet café doesn't lock real people out.
    //(userResolver also throttles per ACCOUNT — this is the per-caller half.)
    login: [{ windowMs: minutes(15), max: 20 }],
    //an honest person signs up once; anything more is a script making accounts
    signup: [{ windowMs: hours(1), max: 5 }],
    //each one sends an email to an address the caller typed. Unlimited, this is
    //a free way to spam a stranger's inbox using our domain.
    requestPasswordReset: [{ windowMs: hours(1), max: 4 }],
    resetPassword: [{ windowMs: hours(1), max: 10 }],
    changePassword: [{ windowMs: hours(1), max: 10 }],
    //irreversible, and nobody deletes their account five times
    deleteAccount: [{ windowMs: hours(1), max: 5 }],
    //called once per app start, and only when the token is over a day old.
    //A caller asking far more often than that is looping, not using the app.
    refreshSession: [{ windowMs: hours(1), max: 20 }],

    //----------------------------- the map -----------------------------
    //careMap re-runs on every filter tap and every search keystroke, so the
    //burst window is deliberately roomy — it is there to catch a retry loop,
    //not ordinary typing.
    careMap: [
        { windowMs: seconds(10), max: 15 },
        { windowMs: minutes(1), max: 60 },
    ],
    nearbyHospitals: [{ windowMs: minutes(1), max: 40 }],
    hospitals: [{ windowMs: minutes(1), max: 40 }],

    //-------------------------- shared writes --------------------------
    //writes to directories everybody reads; wrong data here sends someone to
    //the wrong hospital, so a slow hand is the right default
    addHospital: [{ windowMs: minutes(1), max: 20 }],
    addGuidance: [{ windowMs: minutes(1), max: 20 }],

    //------------------------- image payloads --------------------------
    //carries a base64 avatar, which is orders of magnitude larger than any
    //other request we accept
    completeProfile: [{ windowMs: minutes(1), max: 20 }],
    addAttachment: [{ windowMs: minutes(1), max: 20 }],
};

//A read is cheap and the app fires several on every screen — the dashboard
//alone selects six fields — so this has to stay well clear of normal use.
const DEFAULT_READ: Rule = [{ windowMs: minutes(1), max: 180 }];

//Writes are rarer and cost more: they hit the database and they change data.
const DEFAULT_WRITE: Rule = [{ windowMs: minutes(1), max: 90 }];


//WHO IS BEING COUNTED.
//
//Prefer the user id: it survives a changed IP, and it stops one person on a
//shared connection from spending everyone else's budget. Fall back to the IP
//for anything unauthenticated, which is exactly where login and signup live.
const callerKey = (context: Context) => {
    const userId = context.user?.id;

    if (userId) return `u:${userId}`;

    const forwarded = context.request?.headers?.get('x-forwarded-for');

    if (forwarded) return `ip:${forwarded.split(',')[0].trim()}`;

    return 'ip:unknown';
};


//THE TOP-LEVEL FIELDS THIS OPERATION ACTUALLY RUNS.
//
//Not the operation name — that is whatever the client chose to call it, so it
//can be renamed to dodge a limit. The field names are the real thing.
const executedFields = (operation: OperationDefinitionNode) => {
    const names: string[] = [];

    for (const selection of operation.selectionSet.selections) {
        //fragments at the root are legal but nothing we write uses them; a
        //fragment spread has no field name to count, so skip it rather than
        //guess
        if (selection.kind === Kind.FIELD) names.push(selection.name.value);
    }

    return names;
};


export const operationLimitPlugin: Plugin = {
    onExecute({ args, setResultAndStopExecution }) {
        const operation = getOperationAST(args.document, args.operationName);

        if (!operation) return;

        const context = args.contextValue as Context;
        const caller = callerKey(context);

        const isMutation = operation.operation === 'mutation';
        const fallback = isMutation ? DEFAULT_WRITE : DEFAULT_READ;

        for (const field of executedFields(operation)) {
            //introspection is already blocked in production by securityPlugin,
            //and counting it in development would throttle GraphiQL
            if (field.startsWith('__')) continue;

            const rule = RULES[field] ?? fallback;

            for (const { windowMs, max } of rule) {
                const result = hit(`op:${field}:${caller}`, windowMs, max);

                if (result.allowed) continue;

                const retryAfter = Math.max(
                    Math.ceil((result.resetAt - Date.now()) / 1000),
                    1,
                );

                //A GraphQL error rather than a thrown one, so the client gets a
                //normal 200 with a code it can read. The app shows a "slow down"
                //message instead of the generic network failure it would show
                //for a raw 429.
                setResultAndStopExecution({
                    data: null,
                    errors: [
                        new GraphQLError('Too many requests. Please wait a moment and try again.', {
                            extensions: { code: 'RATE_LIMITED', retryAfter, field },
                        }),
                    ],
                });

                return;
            }
        }
    },
};
