# Imara Afya — backend

GraphQL API for the Imara Afya health app. Node 20+, TypeScript, Express,
graphql-yoga, MongoDB.

Built for a low-connectivity market: 2G/3G, entry-level Android, one instance
in front of managed MongoDB.

## Running it

```bash
# create .env with MONGODB_URI and JWT_SECRET (see src/config/env.ts)
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

## Structure

A modular monolith — one process, but the code is grouped by feature.

```
src/
  config/      env.ts, db.ts
  shared/      context, auth guard, errors, validation, datetime, middleware
  modules/
    index.ts   collects every module's typeDefs and resolvers
    user/      model, types, service, typeDefs, resolvers, index
    auth/      models, services, types, typeDefs, resolvers, index
  schema.ts
  app.ts
  server.ts
```

Everything about a feature is in one folder. Each module's `index.ts` exports
`typeDefs` and `resolvers`; `modules/index.ts` merges them into one schema
using `extend type Query`, so modules never clash.

Services hold the logic and use their models directly. Resolvers read
arguments, call a service, and return — nothing else.

## Adding a feature

1. Create `src/modules/<name>/`
2. `<name>.model.ts`, `<name>.types.ts`, `<name>.service.ts`,
   `<name>.typeDefs.ts`, `<name>.resolvers.ts`
3. `<name>/index.ts` — export `typeDefs` and `resolvers`
4. `modules/index.ts` — import it, add it to the array
5. **`modules/user/user.service.ts` — add the model to `USER_OWNED`**

Step 5 is the easy one to forget. A model with a `user` field that is not in
that list means health data survives an account deletion.

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
