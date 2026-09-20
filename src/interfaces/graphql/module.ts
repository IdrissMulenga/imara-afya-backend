import type { GraphQLContext } from './context.js';

//WHAT A GRAPHQL FEATURE CONTRIBUTES.
//
//A presentation-layer concept only. It describes how a feature's use cases are
//exposed over GraphQL — the use cases themselves know nothing about it, and a
//REST adapter would define its own equivalent without touching them.

export type ResolverMap = Record<
  string,
  (parent: unknown, args: never, context: GraphQLContext) => unknown
>;

export interface GraphQLFeature {
  name: string;

  //`types` holds type/input/enum/union declarations. `queries` and `mutations`
  //hold BARE FIELD LINES only — the builder wraps them once for the whole app,
  //because two features each declaring `type Query` is a schema that will not
  //build.
  typeDefs: {
    types?: string;
    queries?: string;
    mutations?: string;
  };

  resolvers?: {
    Query?: ResolverMap;
    Mutation?: ResolverMap;
    //Field resolvers and union/interface __resolveType. A barrel that spreads
    //only Query and Mutation drops these, and a union then fails at runtime
    //rather than at boot — this key is why that cannot happen.
    types?: Record<string, unknown>;
  };
}

export const defineFeature = (feature: GraphQLFeature): GraphQLFeature => feature;
