import type { FeatureModule } from '../core/module.js';
import auth from './auth/index.js';

//THE MODULE LIST.
//
//Adding a feature to this backend is: create src/modules/<name>/, export a
//FeatureModule from its index.ts, add one line here. That is the whole
//checklist — no barrel files to remember, no schema to interpolate by hand,
//and a feature that is wired in cannot be silently missing from the API.
//
//Order does not affect the schema, but keeping auth first matches the order
//things boot in and the order a reader meets them.

export const modules: FeatureModule[] = [auth];
