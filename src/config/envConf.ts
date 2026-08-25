import dotenv from "dotenv"


dotenv.config();

const requireEnv = (name: string) => {
    const value = process.env[name]?.trim();

    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return value;
};

const optionalEnv = (name: string) => process.env[name]?.trim();

//A NUMBER, OR THE DEFAULT — never NaN.
//
//`Number(optionalEnv('RATE_LIMIT_MAX'))` on a typo gives NaN, and every
//comparison against NaN is false. The rate limiter's `count <= max` would then
//be false for the very first request, so a mistyped env var didn't loosen the
//limit — it locked every user out of the whole API.
const numberEnv = (name: string, fallback: number) => {
    const value = Number(optionalEnv(name));

    return Number.isFinite(value) && value > 0 ? value : fallback;
};

//WHICH ORIGINS MAY CALL US.
//
//`true` means "reflect whatever origin asked", which together with
//`credentials: true` in app.ts means any website in the world can make
//authenticated requests from a signed-in user's browser. That was the DEFAULT
//when FRONTEND_URL was unset, so forgetting one env var opened the API up
//rather than closing it down — the failure was silent and pointed the wrong
//way.
//
//Convenient in development, where the value is genuinely unknown and there is
//nothing to steal. In production it now refuses to start instead.
const parseAllowedOrigins = (value: string | undefined, isProduction: boolean) => {
    const origins = (value ?? '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);

    const wideOpen = !origins.length || origins.includes('*');

    if (wideOpen && isProduction) {
        throw new Error(
            'FRONTEND_URL must list the allowed origins in production. '
            + 'Leaving it unset (or "*") lets any site make authenticated requests. '
            + 'Set it to a comma-separated list, e.g. "https://imaraco.bi,imaraafyafr://".',
        );
    }

    return wideOpen ? true : origins;
};


const NODE_ENV = optionalEnv('NODE_ENV') || 'development';


export const envConf = {
    PORT: numberEnv('PORT', 4000),
    MONGODB_URI: requireEnv('MONGODB_URI'),
    JWT_SECRET: requireEnv('JWT_SECRET'),
    NODE_ENV,
    IS_PRODUCTION: NODE_ENV === 'production',
    //comma separated list. Unset or "*" allows any origin, which is permitted
    //in development only — in production this throws at startup.
    FRONTEND_URLS: parseAllowedOrigins(optionalEnv('FRONTEND_URL'), NODE_ENV === 'production'),
    //how many requests one IP may make per window before being turned away
    RATE_LIMIT_WINDOW_MS: numberEnv('RATE_LIMIT_WINDOW_MS', 60_000),
    RATE_LIMIT_MAX: numberEnv('RATE_LIMIT_MAX', 120),
    //mongo connection pool — one small instance is plenty for the first users,
    //raise this before adding a second instance, not after
    DB_POOL_SIZE: numberEnv('DB_POOL_SIZE', 10),
    //EMAIL (Resend). Both must be set before any mail is sent — without them
    //the reset flow logs to the console in development and fails loudly in
    //production, rather than pretending to have sent something.
    RESEND_API_KEY: optionalEnv('RESEND_API_KEY'),
    //must be an address on a domain verified in Resend, e.g.
    //"Imara Afya <no-reply@imaraco.bi>". Resend rejects anything else.
    MAIL_FROM: optionalEnv('MAIL_FROM'),
    //where "reply" goes if someone answers the reset email — optional, but a
    //no-reply address with nowhere to reply is a small unkindness
    MAIL_REPLY_TO: optionalEnv('MAIL_REPLY_TO'),
    //WHERE THE RESET LINK POINTS.
    //
    //The app's own scheme by default, which opens it directly once installed.
    //Swap for an https App Link (e.g. https://imaraco.bi/reset) once a domain
    //is verified — those are more reliable, because some mail clients refuse to
    //make a custom scheme tappable at all.
    APP_RESET_URL: optionalEnv('APP_RESET_URL') || 'imaraafyafr://reset-password',
    //lets a logged-in user flip their own plan to premium with no payment.
    //Fine while testing, an open till in production — so it must be opted into.
    ALLOW_SELF_UPGRADE: optionalEnv('ALLOW_SELF_UPGRADE') === 'true',
    // TMDB_BASE_URL: requireEnv('TMDB_BASE_URL'),
    // TMDB_API_KEY: requireEnv('TMDB_API_KEY'),
    // OPEN_WEATHER_KEY: requireEnv('OPEN_WEATHER_API_KEY'),
    // OPEN_WEATHER_BASE_URL: requireEnv('OPEN_WEATHER_BASE_URL'),
};