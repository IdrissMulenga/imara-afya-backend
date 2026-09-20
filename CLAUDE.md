# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## What this is

Backend for **Imara Afya**, a health-tracking app for a low-connectivity market
(Bujumbura, Burundi — 2G/3G, entry-level Android). Node/TypeScript, Express,
GraphQL (graphql-yoga), Mongoose. Stateless: no local disk writes, JWT auth,
deploys as a single instance in front of managed MongoDB.

Read [AUTH_DESIGN.md](AUTH_DESIGN.md) before touching anything in
`src/modules/auth/` — it is the specification the code implements, down to the
error codes. Read [SCALING.md](SCALING.md) before assuming something (rate
limiting, indexes, validation) is unhandled, and check its "Still open" list
before telling a user a gap is unaddressed.

## Review standard

Structural changes are reviewed against
[.claude/skills/thermo-nuclear-code-quality-review](.claude/skills/thermo-nuclear-code-quality-review/SKILL.md).
It is deliberately strict: it treats a file crossing 1000 lines, a new
special-case branch in an existing flow, copy-pasted logic where a helper
belongs, and feature logic in a shared path as design problems rather than
nits, and it pushes for restructurings that delete complexity instead of
relocating it.

Run it before merging anything that adds a module or changes a boundary. It is
`disable-model-invocation: true`, so it runs only when asked for by name.

## Commands

```bash
npm run dev        # nodemon + tsx on src/server.ts, no build step
npm run build      # tsc -> dist/
npm start          # node dist/server.js (build first)
npm run lint       # eslint src --ext .ts,.js
npm run lint:fix
npm run format     # prettier --write on src/**
```

No test runner is configured. `AUTH_DESIGN.md` section 18 is the manual pass
until there is one.

Copy `.env_sample` to `.env` first. `MONGODB_URI` and `JWT_SECRET` are
required and `src/config/env.ts` throws at boot without them — deliberately,
so a misconfigured deploy never opens its port.

## Architecture: clean / hexagonal

Four layers. **Dependencies point INWARD only** — `domain` is the centre and
knows nothing about anything else.

```
interfaces/  ->  application/  ->  domain/
       \              |
        `----->  infrastructure/  (implements the interfaces domain declares)
```

```
src/
  domain/              the business, with zero framework imports
    shared/errors/       DomainError + the error codes the app branches on
    auth/
      entities/          User, Otp, TrustedDevice — rules live as methods
      value-objects/     Email, Password, OtpCode, DeviceId — validate once,
                         then the TYPE carries the proof
      repositories/      INTERFACES only; infrastructure implements them

  application/         use cases, orchestration, ports
    auth/
      ports/             Hasher, TokenService, MailService, Clock, RandomSource,
                         AuthPolicy — what the inner layers need, not how
      dto/               plain shapes crossing the boundary
      services/          otp, device-trust, code-delivery — shared by use cases
      use-cases/         one file per operation
      index.ts           assembles the feature from injected dependencies

  infrastructure/      the outside world
    config/              env, auth policy, row caps
    database/mongoose/   schemas, mappers, repository IMPLEMENTATIONS
    security/            bcrypt hasher, JWT tokens, crypto randomness
    mail/                Resend provider + templates
    rate-limit/          in-memory bucket store
    logging/

  interfaces/          transports
    graphql/             typedefs, resolvers, guards, schema builder, plugins
    http/                express app and middleware

  shared/utils/        pure helpers usable by any layer
  container.ts         THE COMPOSITION ROOT — the only place concretes meet ports
  main.ts              boot and graceful shutdown
```

### The rules, in order of importance

1. **`domain/` imports nothing but itself.** No mongoose, no express, no
   graphql, no jsonwebtoken, no bcrypt. If a change needs one of those in
   `domain/`, the change is in the wrong layer.
2. **`application/` depends on interfaces, never implementations.** A use case
   takes a `UserRepository`, not `UserModel`. That is what lets it be tested
   against a Map in twenty lines with no database.
3. **`infrastructure/` and `interfaces/` are replaceable.** Swapping MongoDB
   for Postgres, or GraphQL for REST, means writing new files in one of those
   two folders and changing one line in `container.ts`.
4. **`container.ts` is the only file that names both a port and its
   implementation.** No DI container, no decorators, no reflection — explicit
   wiring a small team can read top to bottom.

### Adding a feature

1. `domain/<feature>/` — entities, value objects, repository interfaces
2. `application/<feature>/` — use cases, and an `index.ts` assembling them
3. `infrastructure/database/mongoose/` — schema, mapper, repository impl
4. `interfaces/graphql/<feature>/` — typedefs and resolvers
5. `container.ts` — wire it, register its purger, add its feature to the schema

Write the layers in that order. Going outside-in is how persistence concerns
end up inside business rules.

### Two boot guards — do not weaken either

- **Duplicate field names** across GraphQL features throw at boot, naming both.
- **`assertPurgeCoverage()`** walks every mongoose model with a `user` path and
  refuses to boot if nothing in `container.ts` erases it on account deletion. A
  model left out means personal health data survives a delete — a
  data-protection failure, not an untidiness one.

## Conventions

- **Resolvers are wrapped, always.** `open` / `authed` / `verified` /
  `adminOnly` from `interfaces/graphql/guards.ts`. The wrapper IS the auth
  guard and the error handler, so no resolver needs a try/catch or a manual
  check. Never read `context.caller` outside a wrapper.
- **A resolver unwraps arguments, calls a use case, returns.** Nothing else. A
  resolver containing an `if` about business rules is a use case in the wrong
  file.
- **Inner layers throw `DomainError`.** `interfaces/graphql/error-mapper.ts` is
  the single place one becomes a transport response.
- **Errors carry a code** from `domain/shared/errors/error-codes.ts`. The app
  branches on the code, never the message.
- **Validation happens once, in a value object.** `Email.create()` either
  throws or hands back a proven address; nothing downstream re-checks.
- **Patch operations use a field table, not a run of `if (x !== undefined)`.**
  See `profile.use-cases.ts` — adding a field is one line and cannot skip
  validation.
- **Every list query is capped** via `infrastructure/config/limits.config.ts`.
  When a cap is genuinely hit, add cursor pagination — do not raise it.
- **Dates go through `shared/utils/datetime.ts`.** Never
  `new Date().toISOString().slice(0, 10)` — that is the UTC day, not the
  user's, and it misfiles anything logged after local midnight.
- **Module system**: `"type": "module"` + NodeNext. Relative imports carry
  explicit `.js` extensions even though the source is `.ts`.

## Review standard

Structural changes are reviewed against
[.claude/skills/thermo-nuclear-code-quality-review](.claude/skills/thermo-nuclear-code-quality-review/SKILL.md).
It is deliberately strict: it treats a file crossing 1000 lines, a new
special-case branch in an existing flow, copy-pasted logic where a helper
belongs, and feature logic in a shared path as design problems rather than
nits, and it pushes for restructurings that delete complexity instead of
relocating it.

Run it before merging anything that adds a module or changes a boundary. It is
`disable-model-invocation: true`, so it runs only when asked for by name.

## Commands

```bash
npm run dev        # nodemon + tsx on src/server.ts, no build step
npm run build      # tsc -> dist/
npm start          # node dist/server.js (build first)
npm run lint       # eslint src --ext .ts,.js
npm run lint:fix
npm run format     # prettier --write on src/**
```

No test runner is configured. `AUTH_DESIGN.md` section 18 is the manual pass
until there is one.

Copy `.env_sample` to `.env` first. `MONGODB_URI` and `JWT_SECRET` are
required and `src/config/env.ts` throws at boot without them — deliberately,
so a misconfigured deploy never opens its port.

## Architecture: modular monolith

Every feature is ONE folder under `src/modules/` exporting ONE object.

```
src/
  config/
    env.ts           validated environment; the ONLY place process.env is read
    database.ts      connection, pool, index sync
    constants.ts     row caps on list queries, password rules
  core/
    module.ts        the FeatureModule contract
    schema.ts        assembles every module into one executable schema
    resolver.ts      open / authed / verified / adminOnly wrappers
    context.ts       the per-request context shape
    logger.ts        structured logging + redact()
    errors/          AppError, error codes, the one GraphQL conversion point
  http/
    app.ts           the express pipeline
    middleware/      security headers, rate limits, depth limit
  modules/
    index.ts         THE MODULE LIST — one line per feature
    auth/
      index.ts            the FeatureModule
      auth.typeDefs.ts    SDL fragments
      auth.resolvers.ts   resolver maps
      auth.service.ts     the flows; throws AppError, no GraphQL
      auth.context.ts     turns a bearer token into context.user
      models/             mongoose schemas
      services/           token, otp, device, mail, account
  shared/
    utils/           datetime, validation — used across modules
  server.ts          boot order and graceful shutdown
```

### Adding a feature

1. Create `src/modules/<name>/`.
2. Export a `FeatureModule` from its `index.ts`.
3. Add one line to `src/modules/index.ts`.

That is the entire checklist. **This is a deliberate replacement for the
previous four-files-plus-two-barrels layout**, where a feature that was not
wired into both barrel files compiled cleanly and was silently absent from the
schema. Do not reintroduce barrel files.

A module declares:

- `typeDefs.types` — type/input/enum/union declarations
- `typeDefs.queries` / `.mutations` — **bare field lines only**, no wrapping
  `type Query { }`; the schema builder wraps them once for the whole app
- `resolvers.Query` / `.Mutation` / `.types` — the `types` key is for field
  resolvers and union `__resolveType`. The old barrel spread only Query and
  Mutation, so a union failed at runtime; this key is why that cannot recur.
- `ownedModels` — every model holding rows keyed to a user

### Two boot guards — do not weaken either

- **Duplicate field names** across modules throw at boot, naming both modules.
- **`assertPurgeCoverage()`** walks every mongoose model with a `user` path and
  refuses to boot if one is not in some module's `ownedModels`. A model left
  out means personal health data survives an account deletion. That is a
  data-protection failure, not an untidiness one.

## Conventions

- **Resolvers are wrapped, always.** `open` (public), `authed`, `verified`
  (authed + `emailVerified`), `adminOnly` from `core/resolver.ts`. The wrapper
  IS the auth guard and the error handler — a resolver needs no try/catch and
  no manual auth check. Never read `context.user` outside a wrapper.
- **Services know nothing about GraphQL.** They take plain arguments, return
  plain objects, and throw `AppError`. `core/errors/toGraphQLError.ts` is the
  single conversion point. This is what lets a service be called from a script
  or a worker later.
- **Errors carry a code.** `extensions.code` from `core/errors/codes.ts`. The
  app branches on the code, never the message. Add a specific code rather than
  reusing a vague one.
- **Every user-owned query filters by `{ user: context.user.id }`** — never
  trust an id alone. This is what keeps one account from reading another's
  records, and it is load-bearing, not incidental.
- **List queries are capped.** `.sort(...).limit(LIMITS.<collection>)` from
  `config/constants.ts`. Every new list query needs an entry there. When a cap
  is genuinely hit, add cursor pagination — do not raise the number.
- **Dates go through `shared/utils/datetime.ts`** (`dayInZone`, `minutesInZone`,
  `addDays`, `daysBetween`, `streakLength`). **Never** write
  `new Date().toISOString().slice(0, 10)` — that is the UTC day, not the user's,
  and it is what misfiles anything logged just after local midnight. Four
  resolvers each grew their own copy of that line before it was removed.
- **Validation is server-side** in `shared/utils/validation.ts`, even where the
  app validates too. curl bypasses the app.
- **Module system**: `"type": "module"` + NodeNext. All relative imports carry
  explicit `.js` extensions even though the source is `.ts`.

## Request pipeline (`src/http/app.ts`)

security headers → CORS → 1mb body cap → `/health` → per-IP rate limit →
graphql-yoga (depth limit + introspection control → per-operation rate limit →
context → resolvers).

Order matters. `/health` sits ABOVE the rate limiter so an uptime monitor
polling every ten seconds cannot exhaust the IP budget and report an outage it
caused itself.

- **Both rate limiters share in-memory buckets** (`hit()` in
  `http/middleware/rateLimit.ts`). Counts reset on restart and are NOT shared
  between instances. This is a known, deliberate limitation until a second
  instance runs — not a bug to silently fix by adding Redis.
- Check the `RULES` table in `http/middleware/operationLimit.ts` before
  assuming a new mutation is unlimited; unlisted fields fall through to a
  default read/write budget.
- Both limiters key on `req.ip`, which express resolves via `trust proxy`.
  **Never** read `x-forwarded-for` directly — the caller writes that header, so
  a fresh value per request means a fresh budget.
- CORS is locked to `FRONTEND_URL`, but leaving it unset allows **any** origin.

## Auth (`src/modules/auth/`)

JWT, HS256, algorithm and issuer pinned on sign AND verify. Every token carries
`v` (the user's `tokenVersion` at issue) and `o` (when the password was last
typed). `auth.context.ts` rejects a token whose `v` is behind the user's
current `tokenVersion` — bumped on logout, password change and reset, which
revokes every older token instantly. The 30-day cap is enforced in
`refreshSession` via `sessionOriginExpired`; it stops a session being *renewed*
forever, and an existing token still works until its own 7-day expiry.

Reset tokens are a separate kind with an explicit `purpose` claim, so a session
token cannot be used to set a password and vice versa. Both directions are
checked.

One-time codes are bcrypt-hashed, single use, 10 minutes, 5 attempts, one live
code per user per purpose. A LOGIN code records the `deviceId` it was issued
for and will not trust a different one.

## Startup (`src/server.ts`)

register owned models → connect DB → `assertPurgeCoverage()` → sync indexes
(production) → module `onStart` hooks → listen.

Everything that can fail permanently fails BEFORE the port opens. A process
that never listens gets replaced by the platform; one that listens and
half-works serves errors to real users.

Graceful shutdown on SIGTERM/SIGINT drains the HTTP server, then closes the
Mongo pool — in that order, because closing the pool first fails every
in-flight request. A 10s forced exit and a re-entry guard stop a second signal
closing the pool underneath requests still finishing.

## Style

ESLint flat config runs Prettier as a rule (`prettier/prettier: error`), not a
separate step. Single quotes, semicolons, 2-space indent, 100-char width, CRLF.

Comments in this codebase are dense and explain **why** — a past bug, a
deliberate tradeoff, a constraint from the target market. Match that voice when
extending existing files; do not add what/how comments that restate the code.
