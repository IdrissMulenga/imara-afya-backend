import { createSchema } from 'graphql-yoga';
import type { GraphQLSchema } from 'graphql';
import type { GraphQLFeature } from './module.js';
import type { GraphQLContext } from './context.js';
import { logger } from '../../infrastructure/logging/logger.js';

//SCHEMA ASSEMBLY.
//
//Walks the feature list and builds one executable schema: interpolating SDL,
//merging resolver maps, and wrapping the bare field lines into single Query
//and Mutation types.
//
//Duplicate field names across features are a real hazard: two features both
//exporting `stats` would silently overwrite one another. This throws at boot,
//naming both.

const SCALARS = /* GraphQL */ `
  scalar DateTime
`;

const collectFields = (features: GraphQLFeature[], kind: 'queries' | 'mutations'): string => {
  const owners = new Map<string, string>();
  const lines: string[] = [];
  const label = kind === 'queries' ? 'query' : 'mutation';

  for (const feature of features) {
    const sdl = feature.typeDefs[kind];
    if (!sdl) continue;

    for (const line of sdl.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const fieldName = trimmed.split(/[(:]/)[0]?.trim();
      if (fieldName) {
        const owner = owners.get(fieldName);
        if (owner) {
          throw new Error(
            `Duplicate ${label} field "${fieldName}": ` +
              `declared by both "${owner}" and "${feature.name}".`
          );
        }
        owners.set(fieldName, feature.name);
      }
      lines.push(`  ${trimmed}`);
    }
  }

  return lines.join('\n');
};

const collectResolvers = (features: GraphQLFeature[]) => {
  const Query: Record<string, unknown> = {};
  const Mutation: Record<string, unknown> = {};
  const types: Record<string, unknown> = {};

  for (const feature of features) {
    Object.assign(Query, feature.resolvers?.Query ?? {});
    Object.assign(Mutation, feature.resolvers?.Mutation ?? {});

    //Type-level resolvers MERGE per type rather than replacing, so two
    //features can each contribute fields to `User` without clobbering.
    for (const [typeName, fields] of Object.entries(feature.resolvers?.types ?? {})) {
      types[typeName] = { ...(types[typeName] as object), ...(fields as object) };
    }
  }

  return { Query, Mutation, types };
};

export const buildSchema = (features: GraphQLFeature[]): GraphQLSchema => {
  const typeBlocks = features
    .map((feature) => feature.typeDefs.types?.trim())
    .filter(Boolean)
    .join('\n\n');

  const typeDefs = /* GraphQL */ `
    ${SCALARS}

    ${typeBlocks}

    type Query {
${collectFields(features, 'queries')}
    }

    type Mutation {
${collectFields(features, 'mutations')}
    }
  `;

  const { Query, Mutation, types } = collectResolvers(features);

  logger.info('Schema assembled', {
    features: features.map((feature) => feature.name),
    queries: Object.keys(Query).length,
    mutations: Object.keys(Mutation).length,
  });

  return createSchema<GraphQLContext>({
    typeDefs,
    resolvers: { Query, Mutation, ...types },
  });
};
