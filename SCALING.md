# Imara Afya — Scaling Guide

How the backend grows from the current MVP to **10,000+ users** in the target market
(Bujumbura, Burundi — low-end Android, intermittent 2G/3G connectivity, regulated health data).

## TL;DR

10,000 users (≈3,500 monthly active at the PRD's 35% target) is a **modest load**. A single
well-configured Node instance plus a managed MongoDB handles it comfortably. The work ahead is
**not raw throughput** — it's reliability, data protection, and coping with poor connectivity.
We are *hardening*-constrained, not scale-constrained.

## What we do NOT need yet

Adding these now buys complexity, not stability:

- Microservices / service mesh
- Kubernetes / container orchestration
- Database sharding
- Message queues (Kafka, RabbitMQ)
- A caching layer (Redis) — revisit only if read load proves it

The one architectural decision that already helps: **auth is stateless (JWT)**. When we do need
more capacity, we run 2–3 instances behind a load balancer with no rework.

## Priorities (in order)

### 1. Security & compliance — highest

We hold health data in a regulated market. A breach or compliance miss hurts far more than a slow
response.

- **Encryption** at rest and in transit (managed MongoDB Atlas provides both; enforce TLS).
- **Reproductive-data re-auth** (PRD §9): period/pregnancy data behind a PIN/biometric check
  separate from login. Backend needs a PIN hash on the user + a guard on that data. *Not built yet.*
- **Rate limiting** on `login` / `signup` to stop brute-force and abuse.
- **Input validation**: email format, password strength, bounds on numeric fields. *Not built yet.*
- **Secrets management**: keep `JWT_SECRET`, DB URI, and provider keys out of source; rotate them.
- **Compliance**: align with Burundian data-protection requirements; document consent for any
  clinical features.

### 2. Connectivity — the real bottleneck

Burundi, 2G/3G, entry-level Android is where users actually suffer — not the server CPU.

- **Pagination** on all list queries (`myHealthRecords`, `myMedications`, `myCycles`) with
  `limit` / `offset` (or cursor) before data grows. Today they return everything. *Not built yet.*
- **Small payloads**: request only the fields the screen needs; avoid over-fetching.
- **Offline-first frontend** (PRD requirement): queue writes locally, sync when back online;
  cache records, medication schedules, and downloaded content for offline viewing.

### 3. Database fitness

- **Indexes** on every field we filter by. Today only `User.email` is indexed. Add:
  - `HealthRecord.user`, `Medication.user`, `PeriodCycle.user`
  - compound indexes where we sort (e.g. `{ user: 1, createdAt: -1 }`)
  Without these, queries do full collection scans that slow down as documents multiply.
- **Managed MongoDB** (Atlas) with automated backups and point-in-time recovery.
- **Geo**: if the hospital finder grows, replace the in-memory haversine scan with a real
  `2dsphere` index + `$near` query.
- **Connection pooling**: tune Mongoose pool size for the number of app instances.

### 4. Operational reliability

Boring but decisive — this keeps the app up when no one is watching.

- **Error monitoring** (e.g. Sentry).
- **Structured logging** with request IDs.
- **Health check** endpoint (`/health`) for the load balancer / uptime checks.
- **Graceful shutdown** (drain connections on SIGTERM).
- **Process manager / container** (PM2 or Docker) so crashes auto-restart.
- **CI**: run `tsc` + tests on every push to catch breakage before deploy.

### 5. Media & auth hardening

- **Object storage** for attachments (S3 / Cloudinary); the DB stores only URLs. *Currently URLs
  only — no upload pipeline yet.*
- **Refresh tokens / revocation**: a 7-day JWT that can't be invalidated is a liability with real
  users. Add short-lived access tokens + revocable refresh tokens, and a logout path.

## Open decision to settle before scaling

**Data residency** (PRD open question): in-region hosting vs an international cloud provider.
Affects compliance and latency, and it's far cheaper to choose now than to migrate later.

## Rough capacity path

| Stage | Users | Setup |
| --- | --- | --- |
| Now (MVP) | launch–1k | 1 app instance + managed MongoDB, backups on |
| Growth | 1k–10k | Same, plus indexes, pagination, monitoring, rate limiting |
| Beyond | 10k+ | 2–3 stateless instances behind a load balancer; add Redis only if reads demand it |

## Concrete near-term backend TODOs

Quick, high-value items that directly support scale.

**Done — "first 100 users" hardening pass**

- [x] Compound indexes on every user-scoped collection (`healthRecord`, `medication`,
      `medicationLog`, `periodCycle`, `habitLog`, `pregnancy`, `guidance`)
- [x] Hard row caps on every list query (`src/utils/limits.ts`) — no unbounded reads
- [x] Per-IP rate limiting on `/graphql` (`src/middleware/rateLimit.ts`)
- [x] Per-operation rate limiting (`src/middleware/operationLimit.ts`) — the per-IP limiter counts
      HTTP requests, which for GraphQL means `login` and `careMap` and `logHabit` all spend one
      shared budget. This counts the *fields executed*, keyed by user id where we have one and IP
      otherwise, so credential and email-sending operations can be held to a few per hour without
      throttling ordinary reads. Anything not named explicitly falls through to a default
      read/write budget, so new fields are covered from the day they ship.
- [x] Map geometry moved server-side (`src/utils/geo.ts`, `src/config/mapConfig.ts`) — distance,
      radius, sorting and the map's opening region are computed once in the backend instead of
      being reimplemented on each client
- [x] CORS locked to `FRONTEND_URL` (was: the `cors` package was installed but never wired up)
- [x] `/health` endpoint reporting app + database state
- [x] Graceful shutdown on SIGTERM/SIGINT, draining connections and closing the DB pool
- [x] GraphiQL and unmasked errors disabled in production
- [x] Mongo connection pool capped, with fail-fast server selection
- [x] Admin-only writes on the shared `guidance` and `hospital` directories

**Done — security pass**

- [x] JWT algorithm + issuer pinned on sign *and* verify (an unpinned `verify` accepts whatever
      algorithm the token header claims — the classic JWT confusion attack)
- [x] Email / password / name / numeric-bound validation enforced server-side, not just in the app
- [x] Per-account login throttling (8 failures per 15 min) on top of the per-IP limit
- [x] Login runs a bcrypt compare even when the account doesn't exist, so response timing can't
      be used to discover who has an account
- [x] GraphQL query depth limit (10) — an unbounded endpoint will execute a 500-deep query
- [x] Schema introspection disabled in production
- [x] Security headers (nosniff, DENY framing, no-referrer, no-store, HSTS)
- [x] 1mb request body cap
- [x] `upgradeToPremium` disabled unless `ALLOW_SELF_UPGRADE=true` — it grants a paid plan for
      free, since no payment step exists yet
- [x] **Token revocation** via `tokenVersion` on the user, carried in every token and checked in
      `context.ts`. `logout`, `changePassword` and `resetPassword` all bump it, which instantly
      retires every token issued before that point
- [x] **Password reset**: single-use code, sha-256 hashed at rest, 30-minute expiry, constant-time
      comparison, capped at 5 requests per address per hour, and it returns the same answer
      whether or not the account exists (so it can't be used to discover who is registered)
- [x] `changePassword` requires the current password and signs out every other device

**Verified already safe**

- Every resource query and mutation is scoped by `user`, so one account cannot read or modify
  another's records by guessing an id (no IDOR).
- Passwords are `select: false` and never leave the server; the `User` GraphQL type exposes no
  password field at all.
- Gender, premium and admin gates (`womenOnlyCheck`, `premiumCheck`, `adminCheck`) are enforced
  in resolvers — the app hiding a tab is cosmetic, the backend is what actually refuses.

**Still open**

- [ ] **Connect an email provider.** The password reset flow is complete except for delivery —
      see `src/services/mailService.ts`. In development the code prints to the console; in
      production `requestPasswordReset` fails loudly rather than pretending to have sent mail.
      Until a provider is wired up, users cannot actually reset their password.
- [ ] Cursor pagination in the schema (the caps above are a stopgap, not pagination)
- [ ] Move rate-limit and login-attempt counters to Redis **before** running a second instance —
      they are in-process, so N instances means N times the effective limit
- [ ] Reproductive-data encryption at field level, not just at rest (PRD §9 treats this as the
      most sensitive data in the app)
- [ ] Input validation (email format, password strength)
- [ ] Reproductive-data PIN/re-auth (PRD §9)
- [ ] Refresh tokens + logout / revocation
- [ ] Move attachments to object storage with an upload flow
- [ ] Error monitoring (Sentry) and structured logging with request IDs
- [ ] Automated backups verified by an actual restore test

## What "100 users" actually costs

Worth being concrete, because the honest answer is that this load is small:

- 100 users, ~35 daily active, each opening the app a few times a day ≈ **a few thousand
  requests/day**. That is single-digit requests per minute at peak.
- One small instance (512 MB) plus MongoDB Atlas M0/M10 covers it with enormous headroom.
- The binding constraint is **not** CPU or database throughput. It is: nobody being paged when
  the server dies, no backup that has been restore-tested, and no way to revoke a leaked token.
  Those are the three things worth fixing before user 101.
