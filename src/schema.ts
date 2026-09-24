import { createSchema } from 'graphql-yoga';
import type { GraphQLSchema } from 'graphql';
import { typeDefs, resolvers } from './modules/index.js';
import type { Context } from './shared/context.js';

export const schema: GraphQLSchema = createSchema<Context>({ typeDefs, resolvers });
