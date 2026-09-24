# AGENTS.md

Guidance for Codex when working in this repository.

## What this is

Backend for **Imara Afya**, a health-tracking app for a low-connectivity market
(Bujumbura, Burundi — 2G/3G, entry-level Android). Node/TypeScript, Express,
GraphQL (graphql-yoga), Mongoose. One process, one database, deployed as a
single instance.

Read [AUTH_DESIGN.md](AUTH_DESIGN.md) before touching anything in
`modules/auth/auth.service.ts` or `modules/auth/otp.service.ts` — it is the
specification this code implements, down to the error codes.

## Commands

```bash
npm run dev        # nodemon + tsx on src/server.ts, no build step
npm run build      # tsc -> dist/
npm start          # node dist/server.js (build first)
npm run lint       # eslint src --ext .ts,.js
npm run lint:fix
npm run format     # prettier --write on src/**
```

No test runner is configured. `AUTH_DESIGN.md` section 18 is the manual pass.

Copy `.env_sample` to `.env` first. `MONGODB_URI` and `JWT_SECRET` are
required — `src/config/env.ts` throws without them, deliberately, so a
misconfigured deploy never opens its port.

## Structure

A modular monolith. One process, one database — but the code is grouped by
FEATURE, not by file type. Everything about a feature lives in one folder.

```
src/
  config/
    env.ts              every environment variable, read and checked once
    db.ts               mongoose connection, disconnect, health check

  shared/               used by more than one module
    context.ts          the Context every resolver receives
    auth-guard.ts       requireAuth(context)
    errors.ts           ErrorCode list, appError(), handleError()
    validation.ts       normalizeEmail, checkPassword, maskEmail, ...
    datetime.ts         dayInZone, addDays, streakLength, ...
    middleware/
      auth.ts           turns a bearer token into context.user
      rateLimit.ts      per-IP middleware + per-operation yoga plugin
      security.ts       security headers + query depth limit

  modules/
    index.ts            collects typeDefs and resolvers from every module
    user/
      user.model.ts     the mongoose schema
      user.types.ts     the input shapes this module accepts
      user.service.ts   profile, preferences, delete account
      user.typeDefs.ts  the User type and its queries/mutations
      user.resolvers.ts
      index.ts          exports typeDefs, resolvers, and the User model
    auth/
      otp.model.ts
      device.model.ts
      auth.types.ts
      token.service.ts  sign and verify JWTs
      mail.service.ts   Resend, and the email copy
      otp.service.ts    create / send / verify one-time codes
      device.service.ts trust, touch, list, revoke
      auth.service.ts   signup, login, reset, change password, refresh, logout
      auth.typeDefs.ts
      auth.resolvers.ts
      index.ts
    habit/              daily water, steps and sleep; streaks against the profile goals
      habit.model.ts    one HabitLog per user per day (day = YYYY-MM-DD in user's tz)
      habit.service.ts  logHabits, addWater, summary, history
      ...

  schema.ts             builds the executable schema from modules/index.ts
  app.ts                the express pipeline
  server.ts             boot, listen, graceful shutdown
```

### How the modules join up

Each module's `typeDefs` uses `extend type Query { ... }` and
`extend type Mutation { ... }`. `modules/index.ts` declares both types empty
and every module adds to them — which is why two modules can each add queries
without clashing.

Resolvers merge the same way: `Query` and `Mutation` are spread together, and
anything else a module exports (a union `__resolveType`, field resolvers like
`User.bmi`) merges per type.

Modules may import each other through the folder's `index.ts`, never by
reaching inside it. Today: `auth` imports `User` from `modules/user`, and
`user` imports `Otp` and `Device` from `modules/auth` so account deletion can
erase them.

### Adding a feature

Say you are adding water tracking:

1. Create `src/modules/water/`
2. `water.model.ts`, `water.types.ts`, `water.service.ts`,
   `water.typeDefs.ts`, `water.resolvers.ts`
3. `water/index.ts` — export `typeDefs` and `resolvers`
4. `modules/index.ts` — import it, add it to the `modules` array
5. **`modules/user/user.service.ts` — add the new model to `USER_OWNED`**

Step 5 is the one that matters most and is easiest to forget. A model with a
`user` field that is not in that list means the person's health data stays in
the database after they ask for their account to be deleted.

## Conventions

- **Services hold the logic. Resolvers do not.** A resolver reads arguments,
  calls a service, returns. If you are writing an `if` about a business rule in
  a resolver, it belongs in the service.
- **Every resolver that needs a user starts with `requireAuth(context)`** (from `shared/auth-guard.ts`) and
  wraps its body in `try/catch` with `handleError(error, 'fieldName')`. The
  catch is what stops a raw stack trace reaching the API response.
- **Errors carry a code** from `shared/errors.ts`. The app branches on the code,
  never the message — messages get translated and reworded. Throw with
  `appError(ErrorCode.X, 'message')`. If the message means something narrower
  than the code's entry in `shared/messages.ts`, add `{ reason: 'Y' }` and an
  `X.Y` entry in every language — otherwise French, Swahili and Kirundi users
  get the code's generic sentence, which may be the wrong reason.
- **Every query on user data filters by the user.** `{ user: user._id }` — never
  trust an id on its own. This is what stops one account reading another's
  records.
- **Validate on the server even though the app validates too.** curl bypasses
  the app entirely. Rules live in `utils/validation.ts`.
- **Dates go through `shared/datetime.ts`.** NEVER write
  `new Date().toISOString().slice(0, 10)` — that is the UTC day, not the user's.
  A glass of water logged at 00:30 in Bujumbura is 22:30 the previous day in
  UTC, so that line files it under yesterday. Use `dayInZone(date, timezone)`.
- **List queries need a `.limit()`.** A user who has logged daily for two years
  has thousands of rows, and "fetch them all" is the query that gets slower
  every month until it times out.
- **Relative imports carry explicit `.js` extensions** even though the files are
  `.ts` — that is NodeNext, and TypeScript will not add them for you.

## The request pipeline (`src/app.ts`)

security headers → CORS → 1mb body cap → `/health` → per-IP rate limit →
graphql-yoga (depth limit + introspection control → per-operation rate limit →
context → resolvers)

Order matters:

- `/health` sits ABOVE the rate limiter, so an uptime monitor polling every ten
  seconds cannot exhaust the IP budget and report an outage it caused itself.
- Both rate limiters key on `req.ip`, which express resolves via `trust proxy`.
  **Never** read `x-forwarded-for` directly — the caller writes that header, so a
  fresh value per request means a fresh budget.
- Check the `RULES` table in `shared/middleware/rateLimit.ts` before assuming a new
  mutation is unlimited. Unlisted fields fall through to a default budget.
- Rate-limit counters are IN MEMORY. They reset on restart and are not shared
  between instances. That is deliberate while one instance runs — swap the Map
  for Redis before running a second, not before.

## Auth (`src/modules/auth/`)

JWT, HS256, algorithm and issuer pinned on sign AND verify. Pinning on verify is
what stops an `alg: none` token being accepted.

Every token carries the user's `tokenVersion` at signing time.
`shared/middleware/auth.ts` rejects a token whose version is behind the user's current
one — so bumping `tokenVersion` logs out every device at once. Logout, password
change and password reset all do that.

Reset tokens are a separate kind carrying `purpose: 'PASSWORD_RESET'`, checked
on the way in. Without that check, any valid session token would be permission
to set a new password without knowing the old one.

One-time codes: bcrypt-hashed, single use, 10 minutes, 5 attempts, one live code
per user per purpose. A LOGIN code records which device asked for it and will
not trust a different one.

**Do not "optimise" the dummy bcrypt compare in `login()`.** It runs when no
user is found so an unknown email takes the same time as a known one. Without
it, response timing reveals which addresses have accounts.

## Style

ESLint flat config runs Prettier as a rule, not a separate step. Single quotes,
semicolons, 2-space indent, 100-char width, CRLF.

Comments say what a function, field or step does, in one or two lines — e.g.
`//Checks and consumes a code. Returns the device it was issued for.` No
teaching or guidance ("never do X", "do not remove", "this used to…"), no
section banners, no bug history. Rules for contributors live in this file;
deploy steps live in DEPLOY.md.
