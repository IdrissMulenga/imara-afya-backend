import { createSchema } from 'graphql-yoga';
import type { GraphQLSchema } from 'graphql';
import { typeDefs } from './typeDefs/index.js';
import { resolvers } from './resolvers/index.js';
import type { Context } from '../types/index.js';

//THE EXECUTABLE SCHEMA — the SDL plus the functions behind it.
//
//Typed as a plain GraphQLSchema on the way out. createSchema brands the type
//with our Context, and that brand then argues with yoga's own generics in
//app.ts for no benefit — the context is already checked where resolvers use it.
export const schema: GraphQLSchema = createSchema<Context>({ typeDefs, resolvers });
