import express from 'express'
import { createYoga, createSchema } from "graphql-yoga"
import { typeDefs } from './graphql/schemas/index.js';
import { resolvers } from './graphql/resolvers/index.js';
import { context } from "./graphql/context.js"

const app = express()

const schema = createSchema({ typeDefs, resolvers })

const Yoga = createYoga({
    schema,
    context
})

app.use("/graphql", Yoga)

export default app