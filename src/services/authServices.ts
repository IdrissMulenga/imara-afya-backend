import jwt from "jsonwebtoken"
import { envConf } from './../config/envConf.js';
import { GraphQLError } from "graphql"
import type { Context } from "../graphql/context.js"

export const generateToken = (userId: string) => {
    try {
        return jwt.sign({ id: userId }, envConf.JWT_SECRET, { expiresIn: '7d' });
    } catch {
        throw new GraphQLError('Failed to generate auth token', {
            extensions: { code: 'TOKEN_GENERATION_FAILED' },
        });
    }
}

export const verifyToken = (token: string) => { 
    try {
        return jwt.verify(token, envConf.JWT_SECRET);
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