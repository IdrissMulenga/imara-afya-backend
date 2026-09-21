import * as user from './user/index.js';
import * as auth from './auth/index.js';

//ALL THE MODULES.
//
//TO ADD A FEATURE: create its folder, give it an index.ts exporting `typeDefs`
//and `resolvers`, import it here, and add it to the array below. That is the
//whole wiring.

const modules = [user, auth];

//Query and Mutation are declared EMPTY here, and each module uses
//`extend type Query { ... }` to add its own fields. That is what lets two
//modules add queries without clashing.
const baseTypeDefs = /* GraphQL */ `
  type Query {
    _empty: String
  }

  type Mutation {
    _empty: String
  }
`;

export const typeDefs = [baseTypeDefs, ...modules.map((m) => m.typeDefs)];

//MERGING THE RESOLVERS.
//
//Query and Mutation from every module are spread together. Anything else a
//module exports — union __resolveType, field resolvers like User.bmi — is
//merged per type, so two modules could each add fields to User without one
//overwriting the other.
const merged: Record<string, Record<string, unknown>> = { Query: {}, Mutation: {} };

for (const module of modules) {
  for (const [typeName, fields] of Object.entries(module.resolvers)) {
    merged[typeName] = { ...merged[typeName], ...fields };
  }
}

export const resolvers = merged;
