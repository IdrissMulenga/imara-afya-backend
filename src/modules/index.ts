import * as user from './user/index.js';
import * as auth from './auth/index.js';
import * as habit from './habit/index.js';

const modules = [user, auth, habit];

//Base Query and Mutation types; each module extends them.
const baseTypeDefs = /* GraphQL */ `
  type Query {
    _empty: String
  }

  type Mutation {
    _empty: String
  }
`;

export const typeDefs = [baseTypeDefs, ...modules.map((m) => m.typeDefs)];

//Merges every module's resolvers per type.
const merged: Record<string, Record<string, unknown>> = { Query: {}, Mutation: {} };

for (const module of modules) {
  for (const [typeName, fields] of Object.entries(module.resolvers)) {
    merged[typeName] = { ...merged[typeName], ...fields };
  }
}

export const resolvers = merged;
