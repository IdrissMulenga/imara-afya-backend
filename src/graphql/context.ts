import User from './../models/user.js';
import type { YogaInitialContext } from "graphql-yoga"
import { verifyToken} from "../services/authServices.js"

export type Context = {
    request: Request;
    user?: InstanceType<typeof User>;
};


const getBearerToken = (authHeader: string) => {
    const [scheme, token] = authHeader.trim().split(/\s+/, 2);

    if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
        return '';
    }

    return token;
};


export const context = async (initialContext: YogaInitialContext): Promise<Context> => {
    //get the HTTP request object from YogaInitialContext.
    const request = initialContext.request;

    //get authorization header
    const authHeader = request.headers.get('authorization') || '';

    // set token with baerer authorization header
    const token = getBearerToken(authHeader);

    let user;

    if (token) {
        try {
            const decoded = verifyToken(token); //JwtPayload

            const hasId = !!decoded && typeof decoded === 'object' && typeof decoded.id === 'string';

            if (hasId) {
                // Only access decoded.id if we KNOW it exists
                const findUser = await User.findById(decoded.id);

                if (findUser) user = findUser;
            }
        } catch (err: any) {
            console.error('TOKEN_VERIFICATION_ERROR:', err.message);
        }
    }
  // return context request and user
    return { request, user };
};
