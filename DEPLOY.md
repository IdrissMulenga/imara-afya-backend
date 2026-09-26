# Imara Afya — Backend Deployment

The backend is a Node service: it builds to `dist/` and needs a MongoDB connection
string, a JWT secret and a Resend key for the email codes. The only thing it writes to
disk is profile photos (`UPLOAD_DIR`), which need a persistent volume — see section 3.
Any host that runs Node works: Render, Railway, Fly.io, a VPS, or a container platform.

---

## 1. Before you deploy

Three things to clear first.

### Confirm `.env` was never committed

It isn't tracked today — verified with `git ls-files`. Keep it that way. The ignore
file was named `.gitIgnore`, which git only honours on case-insensitive filesystems
(Windows, macOS by default); on Linux it would have been silently ignored. It's now
`.gitignore`, lowercase, which works everywhere.

If a `JWT_SECRET` or `MONGODB_URI` has ever been pushed anywhere public, rotate both
before launch. Removing a file in a later commit does **not** remove it from history.

### Set up email for the codes

Signup, new-device login and password reset all send a six-digit code by email
through [Resend](https://resend.com). Verify your domain at resend.com/domains and
send from an address on it. The default test sender `onboarding@resend.dev` only
delivers to the owner of the Resend account, so nobody else could sign up.

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
| `JWT_SECRET` | yes | the 48-byte random value generated above (at least 32 characters) |
| `NODE_ENV` | yes | `production` — disables GraphiQL and introspection, turns on HSTS, and makes the checks below required |
| `RESEND_API_KEY` | yes in production | Resend API key; without it no one can receive a code, so the server refuses to start |
| `MAIL_FROM` | yes in practice | e.g. `Imara Afya <codes@yourdomain>` on your verified domain (default is Resend's test sender) |
| `FRONTEND_URL` | yes in production | comma-separated allowed web origins. The phone app sends no `Origin`, so this only matters for a web build, but the server refuses to start without it; set your website's URL |
| `UPLOAD_DIR` | recommended | folder for profile photos, default `uploads`. **Point it at a persistent volume**, or every deploy deletes everyone's photo |
| `MAIL_REPLY_TO` | no | reply-to address on the code emails |
| `MAIL_DEV_TO` | **leave unset** | development only: sends every code to one inbox; ignored in production |
| `PORT` | usually not | most hosts inject it; the app falls back to 4000 |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | no | per-IP limit, default 600 requests per 60 s |
| `DB_POOL_SIZE` | no | default 10. Keep `instances × DB_POOL_SIZE` under your Atlas connection limit |
| `MAX_UPLOAD_MB` | no | largest photo upload, default 10 |
| `SESSION_DAYS`, `MAX_SESSION_DAYS`, `RESET_TOKEN_MINUTES`, `OTP_*`, `DEVICE_TRUST_DAYS`, `MAX_PASSWORD_ATTEMPTS`, `MAX_QUERY_DEPTH`, `JWT_ISSUER` | no | defaults as in `.env_sample` |

`NODE_ENV=production` is the one that matters most. Without it the deployment serves
a public GraphiQL playground and schema introspection.

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
4. **Sign up a real account** through the app and check the code email arrives,
   in the right language, from your own domain.
5. **Point the app at it.** In the frontend's `eas.json`, replace
   `https://REPLACE-WITH-YOUR-PRODUCTION-HOST/graphql` (and the preview one) with the
   deployed `/graphql` URL before building.
6. **Upload a profile photo, redeploy, and check it is still there.** If it is gone,
   `UPLOAD_DIR` is not on a persistent volume.

---

## 6. Known gaps at launch

Deploying is safe; these are things to be honest with yourself about.

- **No error monitoring.** When something breaks in Bujumbura at 2am, nothing tells
  you. Sentry's free tier takes about ten minutes to add and is the highest-value
  thing you can do after deploying.
- **No automated tests.** `AUTH_DESIGN.md` section 18 is the manual pass; run it
  against the deployed server before telling anyone the URL.
- **Rate-limit counters are in-process.** Fine on one instance. Run two and the
  effective limit doubles — move them to Redis before scaling horizontally.
- **Photos live on one disk.** A persistent volume keeps them across deploys, but
  they are not in the database backups; back the volume up too, or move photos to
  object storage (S3, Cloudflare R2) later.
