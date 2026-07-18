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


export const envConf = {
    PORT: Number(optionalEnv('PORT') || 4000),
    MONGODB_URI: requireEnv('MONGODB_URI'),
    JWT_SECRET: requireEnv('JWT_SECRET')
    // TMDB_BASE_URL: requireEnv('TMDB_BASE_URL'),
    // TMDB_API_KEY: requireEnv('TMDB_API_KEY'),
    // OPEN_WEATHER_KEY: requireEnv('OPEN_WEATHER_API_KEY'),
    // OPEN_WEATHER_BASE_URL: requireEnv('OPEN_WEATHER_BASE_URL'),
    // FRONTEND_URLS: parseAllowedOrigins(optionalEnv('FRONTEND_URL')),
};