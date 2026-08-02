# TanStack Starter

A generic SaaS starter for **TanStack Start** on **Cloudflare Workers**: hardened Better Auth, roles with peer protection, Postgres + Hyperdrive + RLS skeleton, Cloudflare Email, Turnstile, optional payment adapters (Purchase + purchase-paid hook), user dashboard, and admin console.

Platform capabilities only — product domain (wallets, marketplaces, etc.) stays in clones. See `CONTEXT.md` and `docs/specs/2026-08-01-platform-capabilities.md`.

## Prerequisites

- [Bun](https://bun.sh)
- [Docker](https://docs.docker.com/get-docker/) (local Postgres via Compose)
- Cloudflare account (Email binding, Hyperdrive, Turnstile for production)

## Quick start

```bash
bun install
cp .env.example .env
# Fill BETTER_AUTH_SECRET (and optional social/payment keys)
bun run db:up          # Postgres 17 + starter_app role (.env.docker)
bun run db:migrate     # drizzle migrations via DATABASE_MIGRATION_URL
bun run db:seed        # local superadmin + user (optional)
bun run dev
```

Open **http://localhost:3000** (not `127.0.0.1` — cookie/origin config is for `localhost`).

## Database (Postgres + Hyperdrive)

### Local Docker

Defaults live in **`.env.docker`** (committed, dev-only) and are mirrored in **`.env.example`**.

| | Value |
|--|--|
| Database | `starter` |
| Superuser | `postgres` / `postgres_dev_password` → `DATABASE_MIGRATION_URL` |
| App role | `starter_app` / `starter_app_dev_password` → Hyperdrive local |

```bash
bun run db:up       # docker compose --env-file .env.docker up -d
bun run db:down     # stop
bun run db:reset    # wipe volume + recreate (destroys local data)
bun run db:migrate
bun run db:seed
```

`scripts/postgres/create-app-role.sh` runs on **first** container init and creates the `starter_app` role (`NOBYPASSRLS`). Drizzle migration `0000_create-app-role.sql` is idempotent for hosted DBs where Docker never ran.

### Migrations & Hyperdrive

1. Apply migrations with the **privileged** URL in `.env` (never the app role):

   ```bash
   # Already set in .env.example for Docker:
   # DATABASE_MIGRATION_URL=postgresql://postgres:postgres_dev_password@localhost:5432/starter
   bun run db:migrate
   ```

2. Generate table migrations after schema changes:

   ```bash
   bun run db:generate
   bun run db:migrate
   ```

3. Runtime access always goes through the **`HYPERDRIVE`** binding in `wrangler.jsonc`. Local `vite dev` uses `hyperdrive[].localConnectionString` (app role). Production: set a real Hyperdrive config id and a strong app-role password.

`drizzle.config.ts` loads `.env` then `.env.local` (override) for `DATABASE_MIGRATION_URL`.
### Local seed users

After migrations, seed a **superadmin** and a **user** (verified email/password) for local sign-in:

```bash
bun run db:seed
# or: bun run seed:local
# bun run db:seed -- --admin-only
# bun run db:seed -- --user-only
```

Defaults (override with `SEED_*` env vars — see `.env.example`):

| Role | Email | Password |
|------|--------|----------|
| `superadmin` | `admin@localhost.dev` | `AdminPass1!` |
| `user` | `user@localhost.dev` | `UserPass1!` |

Idempotent: re-running updates role, name, verified flag, and password hash. Refuses non-local `DATABASE_MIGRATION_URL` unless `SEED_FORCE=1`.

### First Superadmin (production / shared DB)

There is **no** env auto-promotion. After you have a normal user row, promote with SQL:

```sql
UPDATE "user" SET role = 'superadmin' WHERE email = 'you@example.com';
```

Roles: `user` | `admin` | `superadmin`. Superadmin is a protected peer label, not a higher capability tier.

## Auth

- Email/password, optional GitHub, 2FA, passkey, OAuth/OIDC **issuer** (always on).
- Dangerous Better Auth HTTP routes are in `DISABLED_AUTH_PATHS` (`src/lib/auth-paths.ts`); server-side `auth.api.*` still works.
- Turnstile: set `VITE_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` in production; leave blank in dev to disable captcha.
- Email: Cloudflare `send_email` binding `EMAIL`; brand display name from `EMAIL_FROM_NAME`.

```bash
bun run auth:generate   # after changing plugins in src/lib/auth.ts
```

## Routes

| Path | Purpose |
|------|---------|
| `/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`, `/two-factor` | Auth chrome |
| `/oauth/consent` | OAuth issuer consent |
| `/dashboard`, `/dashboard/account` | User shell |
| `/admin/users`, `/admin/audit`, `/admin/oauth-apps` | Admin console |

## Payments (optional)

Stripe / Creem / NowPayments adapters map to a platform **Purchase** row and call the **purchase-paid hook** once. No wallet or subscription product. Disable rails server-side via payment method toggles (admin tools strip — not a fourth nav item).

## Tests

```bash
bun run test
```

Requires **Docker** (Testcontainers starts Postgres for the suite). Unit seams use temp tables as superuser; RLS policy tests migrate into a dedicated `rls_test` database and connect as the real `starter_app` role (NOBYPASSRLS).

Seams under test:

| Seam | Coverage |
|------|----------|
| Auth factory / disabled paths / captcha | Unit list pins + **measured** plugin mounts + HTTP 404 surface |
| Account security | GitHub gate + money-reauth constant |
| Admin security | Peer matrix + **DB last-admin** counts |
| Purchase fulfillment | Idempotent mark-paid + hook once (in-memory) |
| Webhook body-limit + signature | body-limit + payments-verify |
| RLS helpers / policies | API smoke + **admin_action** policy integration |

Bootstrap SQL in `drizzle/0000`–`0002` is the clone-ready path (`db:migrate` without a generate step). After editing Drizzle schema, prefer `bun run db:generate` and treat hand SQL as bootstrap history unless you squash.

### Client-bundle check

After a production build, scan `dist/client` for server-only markers and secret values:

```bash
bun run build
bun run check:client-bundle
```

`bun run deploy` runs the client-bundle check after build.

### Remaining polish (non-blocking)

Some auth/security form strings remain English literals; clones expand Paraglide messages as needed. Out of scope as Starter defaults: wallets, marketplace providers, consumer API-key products, zh locales (in-tree is en+de).

## Scripts

| Command | What |
|---------|------|
| `bun run dev` | Dev server :3000 |
| `bun run build` | Production build |
| `bun run deploy` | Build + wrangler deploy |
| `bun run test` | Vitest |
| `bun run check` | Biome |
| `bun run db:generate` / `db:migrate` | Drizzle |
| `bun run generate-routes` | After adding routes |

## Docs

- `CONTEXT.md` — glossary + invariants  
- `docs/adr/` — architectural decisions  
- `docs/specs/2026-08-01-platform-capabilities.md` — platform capabilities baseline  

## License

See `LICENSE`.
