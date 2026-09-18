import type { Model } from 'mongoose';
import type { Context } from './context.js';

//WHAT A FEATURE MODULE IS.
//
//The previous version of this backend split every feature across six files in
//four directories, and wiring a new one meant editing two barrel files that
//nothing forced you to remember. A feature that compiled but was missing from
//a barrel was simply invisible in the schema, with no error anywhere.
//
//Here a feature is ONE object. It declares its own type definitions, its own
//resolvers, and which of its models hold user-owned data. `registry.ts` reads
//the list; nothing else has to be told the feature exists.
//
//Adding a feature: create src/modules/<name>/, export a FeatureModule from its
//index.ts, add one line to src/modules/index.ts. That is the whole checklist.

export type ResolverMap = Record<string, (parent: unknown, args: never, context: Context) => unknown>;

export interface FeatureModule {
  //Used in log lines and in the boot summary. Keep it short and lowercase.
  name: string;

  //SDL fragments. `types` holds type/input/enum/union declarations; `queries`
  //and `mutations` hold BARE FIELD LINES only — no wrapping `type Query {}`,
  //because the schema builder wraps them once for the whole app.
  typeDefs: {
    types?: string;
    queries?: string;
    mutations?: string;
  };

  resolvers?: {
    Query?: ResolverMap;
    Mutation?: ResolverMap;
    //Field resolvers and union/interface __resolveType live here. The old
    //barrel pattern spread only Query and Mutation, so a union type silently
    //failed at runtime — this key is why that cannot happen again.
    types?: Record<string, unknown>;
  };

  //Every model whose documents belong to one user. Account deletion walks this
  //list, so a model left out means orphaned personal data after a delete.
  //`assertPurgeCoverage()` refuses to boot if a user-scoped model is missing.
  ownedModels?: Model<never>[];

  //Runs once after the database connects. For index creation, seed data, or a
  //cache warm. Must be idempotent — it runs on every boot of every instance.
  onStart?: () => Promise<void>;
}

export const defineModule = (module: FeatureModule): FeatureModule => module;
