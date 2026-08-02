# Local Postgres (Docker)

First boot of `docker compose` runs every executable under this directory
(`docker-entrypoint-initdb.d`). `create-app-role.sh` creates the runtime
`starter_app` role with **NOBYPASSRLS**.

## Credentials (defaults in repo root `.env.docker`)

| Role | User | Password | Use |
|------|------|----------|-----|
| Superuser | `postgres` | `postgres_dev_password` | Drizzle migrate / seed |
| App | `starter_app` | `starter_app_dev_password` | Worker via Hyperdrive |

Database name: **`starter`**.

```text
# Migrations / seed (privileged) — host port = POSTGRES_PORT in .env.docker
postgresql://postgres:postgres_dev_password@localhost:5432/starter

# Runtime (app role — wrangler.jsonc localConnectionString)
postgresql://starter_app:starter_app_dev_password@localhost:5432/starter
```

Postgres **inside** the container always listens on `5432`. Compose maps
`localhost:${POSTGRES_PORT} → container:5432` (e.g. `5432:5432`).  
Wrong: `5432:5432` — host connects but nothing answers.

## Commands

```bash
bun run db:up      # start container
bun run db:down    # stop container
bun run db:reset   # wipe volume + recreate (destroys local data)
bun run db:migrate # apply drizzle migrations
bun run db:seed    # local admin + user
```

## Production / hosted Postgres

Do **not** use `.env.docker` passwords. Create a dedicated app role with a
strong secret (SQL editor or operator-run script), point Hyperdrive at it, and
set `DATABASE_MIGRATION_URL` to a privileged direct URL for migrations only.

Example production role (replace password):

```sql
CREATE ROLE starter_app
  LOGIN
  PASSWORD 'replace-with-strong-secret'
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  NOBYPASSRLS;

GRANT CONNECT ON DATABASE your_db TO starter_app;
GRANT USAGE ON SCHEMA public TO starter_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO starter_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO starter_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO starter_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO starter_app;
```

## Re-running init scripts

`docker-entrypoint-initdb.d` runs **only on an empty data volume**. After the
first `db:up`, changing `.env.docker` or these scripts requires:

```bash
bun run db:reset
```
