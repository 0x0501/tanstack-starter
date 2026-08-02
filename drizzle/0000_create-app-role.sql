-- App role for Hyperdrive connections. NOBYPASSRLS so policies always apply.
-- Local Docker: also created by scripts/postgres/create-app-role.sh on first boot
-- (same name/password as .env.docker). This migration stays idempotent for
-- hosted Postgres where the Docker init script never ran.
-- Password below is a local-dev default; production must use a strong secret.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'starter_app'
  ) THEN
    CREATE ROLE starter_app
      LOGIN
      PASSWORD 'starter_app_dev_password'
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOBYPASSRLS;
  END IF;
END $$;

-- Grant CONNECT on the current database (works for `starter`, `postgres`, …)
DO $$
BEGIN
  EXECUTE format(
    'GRANT CONNECT ON DATABASE %I TO starter_app',
    current_database()
  );
END $$;

GRANT USAGE ON SCHEMA public TO starter_app;

GRANT SELECT, INSERT, UPDATE, DELETE
ON ALL TABLES IN SCHEMA public
TO starter_app;

GRANT USAGE, SELECT, UPDATE
ON ALL SEQUENCES IN SCHEMA public
TO starter_app;

ALTER DEFAULT PRIVILEGES
FOR ROLE postgres
IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLES
TO starter_app;

ALTER DEFAULT PRIVILEGES
FOR ROLE postgres
IN SCHEMA public
GRANT USAGE, SELECT, UPDATE
ON SEQUENCES
TO starter_app;
