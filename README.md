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

## Structure

A plain layered monolith — files grouped by what they are.

```
src/
  config/      env.ts, db.ts
  models/      mongoose schemas, used directly by services
  types/       Context and every input/output shape
  utils/       errors, validation, datetime
  services/    all the business logic
  middleware/  auth, rate limiting, security headers
  graphql/     typeDefs/ and resolvers/, one file per feature
  app.ts       the express pipeline
  server.ts    boot and graceful shutdown
```

Services hold the logic and import models directly. Resolvers read arguments,
call a service, and return — nothing else.

## Adding a feature

1. `models/<name>.model.ts` + export it from `models/index.ts`
2. `types/index.ts` — the input shapes
3. `services/<name>.service.ts` — the logic
4. `graphql/typeDefs/<name>.ts` + add to `typeDefs/index.ts`
5. `graphql/resolvers/<name>.ts` + add to `resolvers/index.ts`
6. **`services/user.service.ts` — add the model to `USER_OWNED`**

Step 6 is the easy one to forget. A model with a `user` field that is not in
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
