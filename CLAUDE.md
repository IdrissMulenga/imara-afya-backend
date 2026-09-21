# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

Backend for **Imara Afya**, a health-tracking app for a low-connectivity market
(Bujumbura, Burundi — 2G/3G, entry-level Android). Node/TypeScript, Express,
GraphQL (graphql-yoga), Mongoose. One process, one database, deployed as a
single instance.

Read [AUTH_DESIGN.md](AUTH_DESIGN.md) before touching anything in
`services/auth.service.ts` or `services/otp.service.ts` — it is the
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

A plain layered monolith. Files are grouped by what they are, and each layer
calls the one below it.

```
src/
  config/
    env.ts          every environment variable, read and checked once
    db.ts           mongoose connection, disconnect, health check
  models/
    user.model.ts   mongoose schemas — used DIRECTLY by services
    otp.model.ts
    device.model.ts
    index.ts        one import line for all three
  types/
    index.ts        Context, all the Input shapes, all the return shapes
  utils/
    errors.ts       ErrorCode list, appError(), handleError()
    validation.ts   normalizeEmail, checkPassword, maskEmail, ...
    datetime.ts     dayInZone, addDays, streakLength, ...
  services/         ALL THE BUSINESS LOGIC lives here
    auth.service.ts   signup, login, reset, change password, refresh, logout
    otp.service.ts    create / send / verify one-time codes
    device.service.ts trust, touch, list, revoke
    mail.service.ts   Resend, and the email copy
    token.service.ts  sign and verify JWTs
    user.service.ts   profile, preferences, delete account
  middleware/
    auth.ts         turns a bearer token into context.user
    rateLimit.ts    per-IP middleware + per-operation yoga plugin
    security.ts     security headers + query depth limit
  graphql/
    typeDefs/       the SDL, one file per feature + index
    resolvers/      the resolvers, one file per feature + index
    schema.ts       ties typeDefs and resolvers together
  app.ts            the express pipeline
  server.ts         boot, listen, graceful shutdown
```

### Adding a feature

Say you are adding water tracking:

1. `models/water.model.ts` — the schema, then export it from `models/index.ts`
2. `types/index.ts` — add the Input shapes it needs
3. `services/water.service.ts` — the logic; import the model directly
4. `graphql/typeDefs/water.ts` — its SDL, using `extend type Query { ... }`
5. `graphql/typeDefs/index.ts` — import it, add it to the array
6. `graphql/resolvers/water.ts` — resolvers calling the service
7. `graphql/resolvers/index.ts` — import it, add it to the array
8. **`services/user.service.ts` — add the new model to `USER_OWNED`**

Step 8 is the one that matters most and is easiest to forget. A model with a
`user` field that is not in that list means the user's health data stays in the
database after they ask for their account to be deleted.

## Conventions

- **Services hold the logic. Resolvers do not.** A resolver reads arguments,
  calls a service, returns. If you are writing an `if` about a business rule in
  a resolver, it belongs in the service.
- **Every resolver that needs a user starts with `requireAuth(context)`** and
  wraps its body in `try/catch` with `handleError(error, 'fieldName')`. The
  catch is what stops a raw stack trace reaching the API response.
- **Errors carry a code** from `utils/errors.ts`. The app branches on the code,
  never the message — messages get translated and reworded. Throw with
  `appError(ErrorCode.X, 'message')`.
- **Every query on user data filters by the user.** `{ user: user._id }` — never
  trust an id on its own. This is what stops one account reading another's
  records.
- **Validate on the server even though the app validates too.** curl bypasses
  the app entirely. Rules live in `utils/validation.ts`.
- **Dates go through `utils/datetime.ts`.** NEVER write
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
- Check the `RULES` table in `middleware/rateLimit.ts` before assuming a new
  mutation is unlimited. Unlisted fields fall through to a default budget.
- Rate-limit counters are IN MEMORY. They reset on restart and are not shared
  between instances. That is deliberate while one instance runs — swap the Map
  for Redis before running a second, not before.

## Auth (`src/services/`)

JWT, HS256, algorithm and issuer pinned on sign AND verify. Pinning on verify is
what stops an `alg: none` token being accepted.

Every token carries the user's `tokenVersion` at signing time.
`middleware/auth.ts` rejects a token whose version is behind the user's current
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

Comments in this codebase explain **why** — a past bug, a deliberate tradeoff, a
constraint from the target market. Match that when extending a file; do not add
comments that restate what the code already says.
