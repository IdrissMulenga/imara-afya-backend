import jwt from "jsonwebtoken"
import { envConf } from './../config/envConf.js';
import { GraphQLError } from "graphql"
import type { Context } from "../graphql/context.js"

//pin the algorithm on both sides. Verifying without this lets an attacker pick
//the algorithm in the token header, which is the classic JWT confusion attack.
const JWT_ALGORITHM = 'HS256' as const;
const JWT_ISSUER = 'imara-afya';

//`v` is the user's tokenVersion at the moment of issue. context.ts compares it
//against the current value and rejects the token if the user has since logged
//out or changed their password.
export const generateToken = (userId: string, tokenVersion = 0) => {
    try {
        return jwt.sign({ id: userId, v: tokenVersion }, envConf.JWT_SECRET, {
            expiresIn: '7d',
            algorithm: JWT_ALGORITHM,
            issuer: JWT_ISSUER,
        });
    } catch {
        throw new GraphQLError('Failed to generate auth token', {
            extensions: { code: 'TOKEN_GENERATION_FAILED' },
        });
    }
}

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
    //content that every user reads (guidance, hospital directory) is admin-only to write
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