# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Backend for **Imara Afya**, a health-tracking app for a low-connectivity market (Bujumbura,
Burundi — 2G/3G, entry-level Android). Node/TypeScript, Express, GraphQL (graphql-yoga), Mongoose.
Stateless service: no local disk writes, JWT auth, deploys as a single instance in front of managed
MongoDB. See [DEPLOY.md](DEPLOY.md) for deployment steps and [SCALING.md](SCALING.md) for the
security/scaling posture and the prioritized backlog — read SCALING.md before assuming something
(rate limiting, indexes, validation) isn't already handled, and check its "Still open" list before
telling a user a gap is unaddressed.

## Commands

```bash
npm run dev              # nodemon + tsx, runs src/server.ts directly (no build step)
npm run build             # tsc -> dist/
npm start                 # node dist/server.js (run build first)
npm run lint               # eslint src --ext .ts,.js
npm run lint:fix
npm run format             # prettier --write on src/**/*.{ts,js,json,md,graphql}
```

There is no test suite/runner configured in package.json currently.

Copy `.env_sample` to `.env` before running anything — `MONGODB_URI` and `JWT_SECRET` are required
(`envConf.ts` throws on missing values). Notable non-obvious var: `ALLOW_SELF_UPGRADE` must stay
unset outside of testing — it lets any logged-in user grant themselves the premium plan for free
since no payment step exists yet.

## Architecture

**Feature-based GraphQL split.** Every domain feature (user, medication, healthRecord, periodCycle,
pregnancy, habit, guidance, wellbeing) gets four parallel files that are
assembled by two barrel files:

```
src/graphql/schemas/types/<feature>.ts      # GraphQL type + Input defs (template strings)
src/graphql/schemas/queries/<feature>.ts    # Query field strings for that feature
src/graphql/schemas/mutation/<feature>.ts   # Mutation field strings for that feature
src/graphql/resolvers/<feature>Resolver.ts  # { Query: {...}, Mutation: {...} }
```

`src/graphql/schemas/index.ts` imports every type/query/mutation string and interpolates them into
one `typeDefs` template. `src/graphql/resolvers/index.ts` spreads every resolver's `Query`/`Mutation`
into one object. **Adding a feature means touching all six places**: the four feature files above,
plus one import+spread line in each barrel. There's no dynamic loading — a new feature that isn't
wired into both barrels compiles but is invisible to the schema.

Conventions inside that split (see [medicationResolver.ts](src/graphql/resolvers/medicationResolver.ts)
as the reference example):
- Mutations always take an `Input` type (`AddMedicationInput`, not loose scalar args); query args
  stay as plain scalars.
- Auth flows (signup/login/refreshSession) return `AuthPayload { token, user }`.
- Every resolver arg list is typed via a matching entry in [src/utils/types.ts](src/utils/types.ts)
  (e.g. `AddMedicationArgs`) rather than inlined — add new arg shapes there, alphabetically-ish by
  feature, matching the existing `type Foo = { input: {...} }` pattern.
- Every resolver starts with `authCheck(context)` (or `premiumCheck`/`adminCheck`/`womenOnlyCheck`
  from [authServices.ts](src/services/authServices.ts)) before touching data.
- Every query/mutation on a user-owned collection filters by `{ user: context.user!.id }` — never
  trust an id alone. This is what keeps one account from reading/writing another's records (no
  IDOR), and it's treated as load-bearing, not incidental.
- List queries are always `.sort(...).limit(LIMITS.<collection>)` — see
  [src/utils/limits.ts](src/utils/limits.ts) for the caps and the reasoning (hard caps as a stopgap
  until cursor pagination exists; raise the cap only as a last resort, prefer adding pagination).
  Every new list query needs an entry there.
- Thrown errors are `GraphQLError` with an `extensions: { code: 'SOME_CODE' } }` — the app reads
  these codes, so pick a specific one rather than reusing a generic `BAD_USER_INPUT` when a
  domain-specific code fits (e.g. `MEDICATION_NOT_FOUND`, `UNKNOWN_DOSE_SLOT`).
- Field-level input validation (email format, string length, numeric ranges) lives in
  [src/utils/validation.ts](src/utils/validation.ts) and is enforced server-side even though the
  app validates too — curl bypasses the app entirely.
- "Today"/day-grouping logic must go through [src/utils/datetime.ts](src/utils/datetime.ts)
  (`dayInZone`, `minutesInZone`, `addDays`, `daysBetween`, `streakLength`) rather than raw
  `Date`/UTC math — the server's timezone is never the user's, and getting this wrong is what
  silently misfiles a dose logged just after midnight. **Never** write
  `new Date().toISOString().slice(0, 10)`: that is the UTC day, and four resolvers each grew their
  own copy of it before it was removed.
- The checks that open a resolver live in
  [src/utils/resolverHelpers.ts](src/utils/resolverHelpers.ts): `userToday`/`userDay` for the
  caller's own calendar, `assertDate`/`assertPastDate`/`assertInstant`/`assertTime`/`assertScale`
  for input, and `rethrow(error, message, code, invalidMessage?)` as the last line of every catch
  block. Pure date arithmetic stays in `datetime.ts`, field-shape rules in `validation.ts`; neither
  imports GraphQL or `Context`.
- Any new model with `user: { ref: "User" }` must be added to `USER_OWNED` in
  [src/services/accountService.ts](src/services/accountService.ts) or account deletion leaves the
  data behind. `assertPurgeCoverage()` runs at startup and refuses to boot if one is missing.

**Request pipeline** ([src/app.ts](src/app.ts)): security headers → CORS (locked to `FRONTEND_URL`,
but note that leaving that var unset allows **any** origin — see `parseAllowedOrigins`) → 1mb JSON
body cap → `/health` (checks `mongoose.connection.readyState`) →
per-IP rate limit ([src/middleware/rateLimit.ts](src/middleware/rateLimit.ts)) → graphql-yoga, with
`securityPlugin` (query depth limit 10, introspection off in production) and
`operationLimitPlugin` (per-field rate limits, keyed by user id or IP —see the `RULES` table in
[src/middleware/operationLimit.ts](src/middleware/operationLimit.ts) before assuming a new mutation
is unlimited; unlisted fields fall through to a default read/write budget). Both rate limiters share
in-memory buckets (`hit()` in rateLimit.ts) — **these reset on restart and are not shared across
instances**; this is a known, deliberate limitation until a second instance is ever run (see
SCALING.md), not a bug to silently fix by adding Redis. Both key on `req.ip` / `Context.ip`, which
express resolves using `trust proxy` — **never** read `x-forwarded-for` directly, since the caller
writes that header and a fresh value per request means a fresh budget.

**Auth** ([src/services/authServices.ts](src/services/authServices.ts),
[src/graphql/context.ts](src/graphql/context.ts)): JWT with pinned algorithm (`HS256`) and issuer on
both sign and verify. Every token carries `v` (the user's `tokenVersion` at issue time) and `o`
(session origin — when the password was actually last typed). `context.ts` rejects a token whose
`v` doesn't match the user's current `tokenVersion` (bumped on logout/password change → instant
revocation of all older tokens). The 30-day `MAX_SESSION_DAYS` cap is enforced in `refreshSession`
via `sessionExpired(origin)` — it stops a session being *renewed* forever, so an existing token
still works until its own 7-day expiry. Don't bypass any of this by reading `context.user` without
going through the exported checks.

**Startup** ([src/server.ts](src/server.ts)): `assertPurgeCoverage()` → connect DB → listen.
Graceful shutdown on SIGTERM/SIGINT drains the HTTP server then closes the Mongo pool, with a 10s
forced-exit timeout and a guard so a second signal can't close the pool underneath requests that
are still finishing.

**Module system**: `"type": "module"` + `NodeNext` — all relative imports must use explicit `.js`
extensions (even though the source is `.ts`), matching the pattern already used throughout `src/`.

## Style

Formatting is enforced by ESLint (flat config, `eslint.config.js`) running Prettier as a rule, not a
separate step — `prettier/prettier: error`. Prettier config: single quotes, semicolons, 2-space
indent, 100-char print width, CRLF line endings. Comments in this codebase are intentionally dense
and explain *why* (a past bug, a deliberate tradeoff, a constraint from the target market) — match
that voice rather than adding what/how comments when extending existing files.
