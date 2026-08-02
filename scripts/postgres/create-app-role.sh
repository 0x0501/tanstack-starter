#!/usr/bin/env bash
# Runs once on empty Postgres data dir (docker-entrypoint-initdb.d).
# Creates the runtime app role used by Hyperdrive localConnectionString.
# Passwords come from container env (.env.docker → docker-compose environment).

set -Eeuo pipefail

psql \
	--set=ON_ERROR_STOP=1 \
	--username "$POSTGRES_USER" \
	--dbname "$POSTGRES_DB" \
	--set=database_name="$POSTGRES_DB" \
	--set=postgres_user="$POSTGRES_USER" \
	--set=app_db_user="$APP_DB_USER" \
	--set=app_db_password="$APP_DB_PASSWORD" <<'EOSQL'

-- Runtime database user — CANNOT be the privileged superuser.
-- NOBYPASSRLS so RLS policies always apply through Hyperdrive.
CREATE ROLE :"app_db_user"
  LOGIN
  PASSWORD :'app_db_password'
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  NOBYPASSRLS;

GRANT CONNECT
ON DATABASE :"database_name"
TO :"app_db_user";

GRANT USAGE
ON SCHEMA public
TO :"app_db_user";

-- Existing tables / sequences (usually empty at init)
GRANT SELECT, INSERT, UPDATE, DELETE
ON ALL TABLES IN SCHEMA public
TO :"app_db_user";

GRANT USAGE, SELECT, UPDATE
ON ALL SEQUENCES IN SCHEMA public
TO :"app_db_user";

-- Tables created later by Drizzle migrations under the superuser
ALTER DEFAULT PRIVILEGES
FOR ROLE :"postgres_user"
IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLES
TO :"app_db_user";

ALTER DEFAULT PRIVILEGES
FOR ROLE :"postgres_user"
IN SCHEMA public
GRANT USAGE, SELECT, UPDATE
ON SEQUENCES
TO :"app_db_user";

EOSQL
