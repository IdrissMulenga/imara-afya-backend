import { userResolvers } from './user.js';

//ALL THE RESOLVERS, MERGED.
//
//Query and Mutation are spread together; everything else (union __resolveType,
//field resolvers) is copied across at the top level.
//
//Adding a feature: write its resolver file, import it, add it to the array.

const resolverModules = [userResolvers];

const merged: Record<string, Record<string, unknown>> = {
  Query: {},
  Mutation: {},
};

for (const module of resolverModules) {
  for (const [typeName, fields] of Object.entries(module)) {
    merged[typeName] = { ...merged[typeName], ...fields };
  }
}

export const resolvers = merged;
