# Deploying PGRS Peedika on Railway (GitHub-only setup)

Everything needed to deploy lives in this repository — Railway deploys
**straight from the GitHub repo** using the per-service `railway.json`
config-as-code files. No Railway CLI, no local configuration.

Services (create one Railway service per app, same repo):

| Service   | Root directory | Config                      | What it does                                                                                                                     |
| --------- | -------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `backend` | `apps/backend` | `apps/backend/railway.json` | Hono API. Builds with tsup, starts `node dist/index.js`, healthcheck `/health`, **pre-deploy runs migrations (+ optional seed)** |
| `worker`  | `apps/worker`  | `apps/worker/railway.json`  | Outbox worker (notifications, counters) — imports the backend worker                                                             |
| `web`     | `apps/web`     | `apps/web/railway.json`     | Customer storefront (Next.js). Binds `$PORT`                                                                                     |
| `admin`   | `apps/admin`   | `apps/admin/railway.json`   | Shop panel (Next.js). Binds `$PORT`, healthcheck `/login`                                                                        |

## Step-by-step

1. **Create the project from GitHub.** In Railway: _New Project → Deploy from
   GitHub repo → select `pgrspeedika`_. This creates the first service
   (Railway will pick the repo root). Name it `backend` and set its
   **Root Directory** to `apps/backend` — Railway picks up
   `apps/backend/railway.json` automatically.

2. **Add PostgreSQL.** In the project: _+ New → Database → Add PostgreSQL_.
   Railway names the service `Postgres` and exposes `DATABASE_URL` on it.

3. **Add the other three services.** For each: _+ New service → GitHub repo →
   same repo_, then set **Root Directory**:
   - `apps/worker` (worker)
   - `apps/web` (storefront)
   - `apps/admin` (shop panel)

4. **Set variables** (per service, in _Variables_ tab). Reference the database
   with Railway's variable syntax `${{Postgres.DATABASE_URL}}`.

   `backend` and `worker` (both need these):

   | Variable             | Value                                                       |
   | -------------------- | ----------------------------------------------------------- |
   | `DATABASE_URL`       | `${{Postgres.DATABASE_URL}}`                                |
   | `BETTER_AUTH_SECRET` | long random string (`openssl rand -base64 32`)              |
   | `BETTER_AUTH_URL`    | `https://<backend-public-domain>` (step 6)                  |
   | `WEB_URL`            | `https://<web-public-domain>`                               |
   | `ADMIN_URL`          | `https://<admin-public-domain>`                             |
   | `CORS_ORIGINS`       | `https://<web-public-domain>,https://<admin-public-domain>` |
   | `NODE_ENV`           | `production`                                                |
   | `NOTIFY_PROVIDER`    | `console` (or `webhook` + `NOTIFY_WEBHOOK_URL`)             |
   | `STORAGE_DRIVER`     | `local` (or `s3` + `S3_*` vars — see `.env.example`)        |

   Optional on `backend` for the **first deploy only**:

   | Variable              | Value                       |
   | --------------------- | --------------------------- |
   | `SEED_ON_DEPLOY`      | `true`                      |
   | `SEED_OWNER_EMAIL`    | owner login email           |
   | `SEED_OWNER_PASSWORD` | strong password (10+ chars) |

   The pre-deploy command applies migrations on every deploy and seeds the
   catalog + owner account when `SEED_ON_DEPLOY=true`. **Remove
   `SEED_ON_DEPLOY` after the first successful deploy** — the seed clears
   catalog tables.

   `web` and `admin`:

   | Variable               | Value                                             |
   | ---------------------- | ------------------------------------------------- |
   | `NEXT_PUBLIC_API_URL`  | `https://<backend-public-domain>`                 |
   | `NEXT_PUBLIC_SITE_URL` | own public domain (optional, for sitemap/OG URLs) |
   | `NODE_ENV`             | `production`                                      |

5. **First deploy (bootstrap).** The `<...-public-domain>` values aren't known
   yet, so for deploy #1 use placeholders that parse as URLs, e.g.
   `BETTER_AUTH_URL=https://backend.up.railway.app`,
   `WEB_URL=https://web.up.railway.app`, `ADMIN_URL=https://admin.up.railway.app`,
   `CORS_ORIGINS=https://web.up.railway.app,https://admin.up.railway.app`,
   `NEXT_PUBLIC_API_URL=https://backend.up.railway.app`.

6. **Generate public domains.** On `backend`, `web` and `admin`: _Settings →
   Networking → Generate Domain_. If a generated domain differs from the
   placeholder you used, update the variables from step 4 with the real
   domains and Railway will redeploy automatically.

7. **Verify.**
   - `https://<backend-domain>/health` → `{"ok":true,...}`
   - `https://<web-domain>` → storefront with seeded catalog
   - `https://<admin-domain>/login` → sign in with `SEED_OWNER_EMAIL/PASSWORD`

8. **Subsequent deploys.** Every push to `main` redeploys all services
   automatically (migrations run pre-deploy on `backend`).

## Notes

- **Cookies work out of the box** on Railway public domains: all
  `*.up.railway.app` services share the registrable domain `railway.app`, so
  `sameSite=lax` session cookies flow between web/admin and the API.
  `useSecureCookies` switches on automatically in production.
- **The worker is stateless** and safe to scale to multiple replicas — the
  outbox poller uses `FOR UPDATE SKIP LOCKED`.
- **Rate limiting** is in-memory per service; for multiple API replicas swap
  the limiter in `apps/backend/src/lib/rate-limit.ts` for a Redis-backed one.
- **Cost tip:** the four services share one build cache; the worker image is
  the same workspace, so cold deploys are fast after the first.
- **Database migrations** are forward-only Drizzle files in
  `packages/db/migrations` — the backend's `preDeployCommand` applies them
  before each release, so the API never starts against a stale schema.
