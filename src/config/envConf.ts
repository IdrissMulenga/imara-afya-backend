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

const parseAllowedOrigins = (value?: string) => {
    if (!value) return true;

    const origins = value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);

    if (!origins.length || origins.includes('*')) {
        return true;
    }

    return origins;
};


const NODE_ENV = optionalEnv('NODE_ENV') || 'development';


export const envConf = {
    PORT: Number(optionalEnv('PORT') || 4000),
    MONGODB_URI: requireEnv('MONGODB_URI'),
    JWT_SECRET: requireEnv('JWT_SECRET'),
    NODE_ENV,
    IS_PRODUCTION: NODE_ENV === 'production',
    //comma separated list, or unset / "*" to allow any origin
    FRONTEND_URLS: parseAllowedOrigins(optionalEnv('FRONTEND_URL')),
    //how many requests one IP may make per window before being turned away
    RATE_LIMIT_WINDOW_MS: Number(optionalEnv('RATE_LIMIT_WINDOW_MS') || 60_000),
    RATE_LIMIT_MAX: Number(optionalEnv('RATE_LIMIT_MAX') || 120),
    //mongo connection pool — one small instance is plenty for the first users,
    //raise this before adding a second instance, not after
    DB_POOL_SIZE: Number(optionalEnv('DB_POOL_SIZE') || 10),
    //lets a logged-in user flip their own plan to premium with no payment.
    //Fine while testing, an open till in production — so it must be opted into.
    ALLOW_SELF_UPGRADE: optionalEnv('ALLOW_SELF_UPGRADE') === 'true',
    // TMDB_BASE_URL: requireEnv('TMDB_BASE_URL'),
    // TMDB_API_KEY: requireEnv('TMDB_API_KEY'),
    // OPEN_WEATHER_KEY: requireEnv('OPEN_WEATHER_API_KEY'),
    // OPEN_WEATHER_BASE_URL: requireEnv('OPEN_WEATHER_BASE_URL'),
};