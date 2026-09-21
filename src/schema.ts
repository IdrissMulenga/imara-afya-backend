import { createSchema } from 'graphql-yoga';
import type { GraphQLSchema } from 'graphql';
import { typeDefs, resolvers } from './modules/index.js';
import type { Context } from './shared/context.js';

//THE EXECUTABLE SCHEMA — every module's SDL plus the functions behind it.
//
//Typed as a plain GraphQLSchema on the way out: createSchema brands the type
//with our Context, and that brand then argues with yoga's own generics in
//app.ts for no benefit.
export const schema: GraphQLSchema = createSchema<Context>({ typeDefs, resolvers });
