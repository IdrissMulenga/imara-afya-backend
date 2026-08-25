import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import { createYoga, createSchema } from "graphql-yoga"
import { typeDefs } from './graphql/schemas/index.js';
import { resolvers } from './graphql/resolvers/index.js';
import { context } from "./graphql/context.js"
import { envConf } from './config/envConf.js';
import { rateLimit } from './middleware/rateLimit.js';
import { securityHeaders, securityPlugin } from './middleware/security.js';
import { operationLimitPlugin } from './middleware/operationLimit.js';
import { mailStatus } from './services/mailService.js';

const app = express()

//behind a hosting proxy, trust x-forwarded-for so rate limiting sees real IPs
app.set('trust proxy', 1)

app.use(securityHeaders)

app.use(cors({
    origin: envConf.FRONTEND_URLS,
    credentials: true,
}))

//cap the request body. Avatars arrive as inline base64 (capped at ~150k chars
//in the resolver), so 1mb is comfortably above any honest request and stops a
//huge payload from tying the instance up.
app.use(express.json({ limit: '1mb' }))

//HEALTH CHECK — hosting platforms poll this to decide whether the instance is
//alive, and it's the quickest way to tell "server down" from "database down"
app.get('/health', (_req, res) => {
    //1 = connected, per mongoose connection states
    const dbUp = mongoose.connection.readyState === 1;

    res.status(dbUp ? 200 : 503).json({
        status: dbUp ? 'ok' : 'degraded',
        database: dbUp ? 'connected' : 'disconnected',
        //'test-sender-only' means password resets reach nobody but the Resend
        //account owner — visible here rather than discovered from a support
        //message three weeks after launch
        mail: mailStatus(),
        uptime: Math.floor(process.uptime()),
    });
})

const schema = createSchema({ typeDefs, resolvers })

const Yoga = createYoga({
    schema,
    context,
    //playground and schema browsing in development only — in production they
    //hand anyone a map of every operation we expose
    graphiql: !envConf.IS_PRODUCTION,
    //hide unexpected stack traces from clients. The GraphQLErrors we throw
    //ourselves, which carry the codes the app reads, still pass through
    maskedErrors: envConf.IS_PRODUCTION,
    //query depth limit, plus no introspection in production, then a per-field
    //budget so one expensive operation can't be hammered inside an otherwise
    //normal-looking request rate
    plugins: [securityPlugin, operationLimitPlugin],
})

app.use("/graphql", rateLimit(), Yoga)

export default app
