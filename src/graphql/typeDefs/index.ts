import { userTypeDefs } from './user.js';

//ALL THE SCHEMA, IN ONE STRING.
//
//`type Query` and `type Mutation` are declared EMPTY here, and each feature
//file uses `extend type Query { ... }` to add its fields. That is why two
//features can both add queries without clashing.
//
//Adding a feature: write its typeDefs file, import it, add it to the array.

const baseTypeDefs = /* GraphQL */ `
  type Query {
    _empty: String
  }

  type Mutation {
    _empty: String
  }
`;

export const typeDefs = [baseTypeDefs, userTypeDefs];
