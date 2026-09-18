import { createSchema } from 'graphql-yoga';
import type { GraphQLSchema } from 'graphql';
import type { FeatureModule } from './module.js';
import type { Context } from './context.js';
import { logger } from './logger.js';

//SCHEMA ASSEMBLY.
//
//Walks the module list and builds one executable schema. Everything that used
//to be manual — interpolating SDL fragments, spreading resolver maps, and
//remembering that unions need a __resolveType outside Query/Mutation — happens
//here, once, for every module that will ever exist.
//
//Duplicate field names across modules are a real hazard in a modular monolith:
//two features both exporting `stats` would silently overwrite one another.
//This throws instead, at boot, naming both modules.

const SCALARS = /* GraphQL */ `
  scalar DateTime
`;

const collectFields = (
  modules: FeatureModule[],
  kind: 'queries' | 'mutations'
): string => {
  const seen = new Map<string, string>();
  const lines: string[] = [];

  for (const module of modules) {
    const sdl = module.typeDefs[kind];
    if (!sdl) continue;

    for (const line of sdl.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const fieldName = trimmed.split(/[(:]/)[0]?.trim();
      if (fieldName) {
        const owner = seen.get(fieldName);
        if (owner) {
          const label = kind === 'queries' ? 'query' : 'mutation';
          throw new Error(
            `Duplicate ${label} field "${fieldName}": ` +
              `declared by both "${owner}" and "${module.name}".`
          );
        }
        seen.set(fieldName, module.name);
      }
      lines.push(`  ${trimmed}`);
    }
  }

  return lines.join('\n');
};

const collectResolvers = (modules: FeatureModule[]) => {
  const Query: Record<string, unknown> = {};
  const Mutation: Record<string, unknown> = {};
  const types: Record<string, unknown> = {};

  for (const module of modules) {
    Object.assign(Query, module.resolvers?.Query ?? {});
    Object.assign(Mutation, module.resolvers?.Mutation ?? {});

    //Type-level resolvers merge per type rather than replacing, so two modules
    //can each contribute fields to `User` without clobbering each other.
    for (const [typeName, fields] of Object.entries(module.resolvers?.types ?? {})) {
      types[typeName] = { ...(types[typeName] as object), ...(fields as object) };
    }
  }

  return { Query, Mutation, types };
};

//Returns a plain GraphQLSchema rather than yoga's context-branded type. The
//brand would force every caller to name yoga's own server-context generic,
//which would put the HTTP layer's types inside core/ for no benefit.
export const buildSchema = (modules: FeatureModule[]): GraphQLSchema => {
  const typeBlocks = modules
    .map((module) => module.typeDefs.types?.trim())
    .filter(Boolean)
    .join('\n\n');

  const queryFields = collectFields(modules, 'queries');
  const mutationFields = collectFields(modules, 'mutations');

  const typeDefs = /* GraphQL */ `
    ${SCALARS}

    ${typeBlocks}

    type Query {
${queryFields}
    }

    type Mutation {
${mutationFields}
    }
  `;

  const { Query, Mutation, types } = collectResolvers(modules);

  logger.info('Schema assembled', {
    modules: modules.map((module) => module.name),
    queries: Object.keys(Query).length,
    mutations: Object.keys(Mutation).length,
  });

  return createSchema<Context>({
    typeDefs,
    resolvers: { Query, Mutation, ...types },
  });
};
