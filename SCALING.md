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

Quick, high-value items that directly support scale and are not yet done:

- [ ] Add indexes on `user` fields (+ compound sort indexes)
- [ ] Add pagination to list queries
- [ ] Add input validation (email, password, numeric bounds)
- [ ] Add rate limiting on auth mutations
- [ ] Add reproductive-data PIN/re-auth (PRD §9)
- [ ] Add refresh tokens + logout / revocation
- [ ] Move attachments to object storage with an upload flow
- [ ] Add error monitoring, `/health`, and graceful shutdown
