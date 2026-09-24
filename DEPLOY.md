# Imara Afya — Backend Deployment

The backend is a stateless Node service: it builds to `dist/` and needs a MongoDB
connection string and a JWT secret. Nothing is written to local disk, so any host
that runs Node works — Render, Railway, Fly.io, a VPS, or a container platform.

---

## 1. Before you deploy

Three things to clear first.

### Remove the scratch files from git

Two throwaway files used to print the GraphQL schema were committed by accident.
`.gitignore` can't exclude an already-tracked file, so they need removing explicitly:

```bash
git rm --cached _sdl_check.mjs .sdlcheck.mjs
```

Then delete them from disk. Neither is imported by anything.

### Confirm `.env` was never committed

It isn't tracked today — verified with `git ls-files`. Keep it that way. The ignore
file was named `.gitIgnore`, which git only honours on case-insensitive filesystems
(Windows, macOS by default); on Linux it would have been silently ignored. It's now
`.gitignore`, lowercase, which works everywhere.

If a `JWT_SECRET` or `MONGODB_URI` has ever been pushed anywhere public, rotate both
before launch. Removing a file in a later commit does **not** remove it from history.

### Generate a real JWT secret

Not a word, not the one from development:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Changing this secret signs every existing user out. That's fine before launch, and
worth knowing after.

---

## 2. Database

MongoDB Atlas is the path of least resistance.

1. Create a cluster. **M0 (free)** is genuinely enough for the first 100 users;
   M10 when you want automated backups and no sleep-on-idle.
2. Create a database user with read/write on one database only — not an admin user.
3. Network access: allow your host's outbound IPs. Render and Railway don't publish
   static IPs on lower tiers, so `0.0.0.0/0` is usually the practical setting —
   which is precisely why the database user's password has to be strong and unique.
4. **Turn on backups and then test a restore.** An untested backup is a guess.

Connection string goes in `MONGODB_URI`, including the database name:

```
mongodb+srv://USER:PASSWORD@cluster.xxxxx.mongodb.net/imara-afya?retryWrites=true&w=majority
```

**Existing databases only:** the OTP TTL index moved from `expiresAt` to `purgeAt`.
Mongo does not drop the old index on its own, so run this once or OTP rows are
deleted too early and the hourly resend cap stops working:

```
db.otps.dropIndex('expiresAt_1')
```

---

## 3. Environment variables

Set these on the host. Everything in `.env_sample` is listed here with what it does.

| Variable | Required | Value for production |
| --- | --- | --- |
| `MONGODB_URI` | yes | Atlas connection string |
| `JWT_SECRET` | yes | the 48-byte random value generated above |
| `NODE_ENV` | yes | `production` — this is what disables GraphiQL, hides error details, disables introspection and turns on HSTS |
| `PORT` | usually not | most hosts inject it; the app falls back to 4000 |
| `FRONTEND_URL` | optional | comma-separated origins. The Expo app sends no `Origin` header, so leave unset unless you ship a web build |
| `RATE_LIMIT_WINDOW_MS` | no | defaults to 60000 |
| `RATE_LIMIT_MAX` | no | defaults to 120 requests/min/IP |
| `DB_POOL_SIZE` | no | defaults to 10. Keep `instances × DB_POOL_SIZE` under your Atlas connection limit |
| `ALLOW_SELF_UPGRADE` | **leave unset** | setting it to `true` lets any user grant themselves the premium plan for free |

`NODE_ENV=production` is the one that matters most. Without it the deployment serves
a public GraphiQL playground and full stack traces.

---

## 4. Build and start

```
Build command:  npm ci && npm run build
Start command:  npm start
Health check:   /health
```

`npm run build` runs `tsc` into `dist/`; `npm start` runs `node dist/server.js`.
Node 20+ is required and declared in `engines`.

`/health` returns `200` when the app and database are both up, `503` when the
database is unreachable — so a failing check tells you which half is broken.

### Render

New → Web Service → connect the repo. Set the build and start commands above,
add the environment variables, set the health check path to `/health`. The free
tier sleeps after inactivity, which means a cold start of ~30s for the unlucky
user who wakes it — worth the paid tier once real people are using it.

### Railway

Detects Node automatically. Add the variables, then set the health check path to
`/health` under Settings.

### Docker / VPS

There's no Dockerfile yet. If you want one, it's a short `node:20-alpine` image
running the same two commands. Ask and I'll write it.

---

## 5. After the first deploy

1. **Check `/health`** returns `{"status":"ok","database":"connected"}`.
2. **Confirm GraphiQL is off.** Opening `/graphql` in a browser should *not* give
   you a playground. If it does, `NODE_ENV` isn't set to `production`.
3. **Confirm introspection is off:**
   ```bash
   curl -s https://YOUR_HOST/graphql -H 'content-type: application/json' \
     -d '{"query":"{ __schema { types { name } } }"}'
   ```
   This should be refused, not answered.
4. **Sign up a real account** through the app, then promote yourself to admin so
   you can seed the hospital directory and guidance content:
   ```
   db.users.updateOne({ email: "you@example.com" }, { $set: { role: "admin" } })
   ```
5. **Point the app at it.** In the frontend, `lib/config.ts` currently targets
   `localhost:5500` for development — it needs the deployed URL for any build that
   isn't running against your machine.

---

## 6. Known gaps at launch

Deploying is safe; these are things to be honest with yourself about.

- **Password reset doesn't deliver.** The whole flow works except sending the email
  — see `src/services/mailService.ts`. In production `requestPasswordReset` returns
  a clear error rather than pretending. Until an email provider is connected, a user
  who forgets their password cannot recover the account, and you'll have to reset it
  manually in the database.
- **No error monitoring.** When something breaks in Bujumbura at 2am, nothing tells
  you. Sentry's free tier takes about ten minutes to add and is the highest-value
  thing you can do after deploying.
- **Rate-limit counters are in-process.** Fine on one instance. Run two and the
  effective limit doubles — move them to Redis before scaling horizontally.
- **The hospital directory is empty until you fill `data/hospitals.json`.** Copy
  `data/hospitals.example.json`, replace it with verified facilities, and commit it. The server
  seeds an empty database automatically on boot — no command to remember, and nothing for a user
  to ever run. Once the collection has data the boot seeder stays out of the way, so it can never
  overwrite a correction made in production with a stale value from the file. To change existing
  entries, run `npm run seed:hospitals` explicitly.
