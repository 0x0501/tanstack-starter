-- RLS context helpers. is_admin() is created in 0002 after "user" exists
-- (SQL-language functions validate relation names at CREATE time).

CREATE SCHEMA IF NOT EXISTS app_private;

REVOKE ALL ON SCHEMA app_private FROM PUBLIC;

GRANT USAGE ON SCHEMA app_private TO starter_app;

CREATE OR REPLACE FUNCTION app_private.current_user_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
    SELECT NULLIF(current_setting('app.user_id', true), '');
$$;

REVOKE ALL ON FUNCTION app_private.current_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.current_user_id() TO starter_app;
