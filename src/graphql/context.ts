import User from './../models/user.js';
import type { YogaInitialContext } from "graphql-yoga"
import { verifyToken} from "../services/authServices.js"

export type Context = {
    request: Request;
    //WHO IS CALLING, when there is no logged-in user to name.
    //
    //Resolved by express, which knows about `trust proxy` and so takes the hop
    //OUR proxy wrote rather than the one the caller put at the front of
    //x-forwarded-for. The per-operation limiter keys on this, and reading the
    //raw header instead is what previously let anyone reset their own budget.
    ip: string;
    user?: InstanceType<typeof User>;
    //only set alongside `user`. `origin` is when the password was last actually
    //typed, which is what caps how long refreshSession may keep sliding.
    session?: { origin: number };
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

    //Yoga hands the express request through as `req` when it's mounted on an
    //express route, which is where the trust-proxy-resolved address lives.
    const ip = (initialContext as { req?: { ip?: string } }).req?.ip || 'unknown';

    //get authorization header
    const authHeader = request.headers.get('authorization') || '';

    // set token with baerer authorization header
    const token = getBearerToken(authHeader);

    let user;
    let session;

    if (token) {
        try {
            const decoded = verifyToken(token); //JwtPayload

            const hasId = !!decoded && typeof decoded === 'object' && typeof decoded.id === 'string';

            if (hasId) {
                // Only access decoded.id if we KNOW it exists
                const findUser = await User.findById(decoded.id);

                //REVOCATION CHECK. A token is only good while its version still
                //matches the account's. Logging out or changing the password
                //bumps that number, which retires every token issued before it.
                const tokenVersion = typeof decoded.v === 'number' ? decoded.v : 0;
                const currentVersion = findUser?.get('tokenVersion') ?? 0;

                if (findUser && tokenVersion === currentVersion) {
                    user = findUser;

                    //`o` is the session origin. Tokens issued before sliding
                    //sessions existed don't carry one, so fall back to when the
                    //token itself was issued — for those, the session simply
                    //starts counting from their last login.
                    const origin = typeof decoded.o === 'number'
                        ? decoded.o
                        : (decoded.iat ?? Math.floor(Date.now() / 1000));

                    session = { origin };
                }
            }
        } catch (err: any) {
            console.error('TOKEN_VERIFICATION_ERROR:', err.message);
        }
    }
  // return context request and user
    return { request, ip, user, session };
};
