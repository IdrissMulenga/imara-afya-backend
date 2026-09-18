# Imara Afya — backend

GraphQL API for the Imara Afya health app. Node 20+, TypeScript, Express,
graphql-yoga, MongoDB.

Built for a low-connectivity market: 2G/3G, entry-level Android, one instance
in front of managed MongoDB.

## Running it

```bash
cp .env_sample .env     # fill MONGODB_URI and JWT_SECRET
npm install
npm run dev             # nodemon + tsx, no build step
```

```bash
npm run build && npm start   # production
npm run lint                 # eslint (prettier runs as a rule)
```

Health check: `GET /health` — 200 when the database is reachable, 503 when it
is not, so a container that is up but cannot serve gets replaced rather than
sent traffic.

## Layout

```
src/
  config/        env, database, row caps
  core/          errors, logger, module contract, schema builder, resolver guards
  http/          express app and middleware
  modules/       one folder per feature
  shared/        utilities used across modules
  server.ts      boot and graceful shutdown
```

## Adding a feature

1. Create `src/modules/<name>/`.
2. Export a `FeatureModule` from its `index.ts`.
3. Add one line to `src/modules/index.ts`.

That is the whole checklist. The schema builder reads the module's SDL, its
resolver map and its owned models. No barrel files to remember, no schema to
interpolate by hand.

Two guards run at boot and refuse to start rather than fail quietly:

- **Duplicate field names.** Two modules exporting the same query or mutation
  would silently overwrite one another; instead the error names both modules.
- **Account-deletion coverage.** Any model with a `user` field that is not in
  some module's `ownedModels` means personal data would survive a delete. The
  server will not boot until it is registered.

## Conventions

- Resolvers are wrapped in `open`, `authed`, `verified` or `adminOnly` from
  `core/resolver.ts`. The wrapper is the guard and the error handler, so no
  resolver needs its own try/catch.
- Services throw `AppError` and know nothing about GraphQL. One conversion
  point, `core/errors/toGraphQLError.ts`, turns them into responses.
- Every error carries an `extensions.code` from `core/errors/codes.ts`. The app
  branches on the code, never the message.
- Every query on user-owned data filters by `{ user: context.user.id }`.
- Day-grouping goes through `shared/utils/datetime.ts`. Never
  `new Date().toISOString().slice(0, 10)` — that is the UTC day, not the
  user's, and it misfiles anything logged after midnight local.
- Relative imports carry explicit `.js` extensions (NodeNext).

## Documents

- [AUTH_DESIGN.md](AUTH_DESIGN.md) — the auth system in full: flows, data
  model, token design, OTP rules, rate limits, error codes, test checklist.
- [SCALING.md](SCALING.md) — security and scaling posture, and what is open.
- [DEPLOY.md](DEPLOY.md) — deployment.

## Known limitations

- **Rate-limit counters are in memory.** They reset on restart and are not
  shared between instances. Deliberate while one instance runs; swap `hit()`
  in `http/middleware/rateLimit.ts` for Redis before a second one.
- **Mail needs a verified domain.** Until then one-time codes reach only the
  Resend account owner, which means signup and new-device login work for
  nobody else.
- **No test runner.** `AUTH_DESIGN.md` section 18 is the manual pass.
