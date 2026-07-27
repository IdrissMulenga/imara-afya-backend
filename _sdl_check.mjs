import { typeDefs } from './src/graphql/schemas/index.js';
import { buildSchema, printSchema } from 'graphql';
console.log(printSchema(buildSchema(typeDefs)));
