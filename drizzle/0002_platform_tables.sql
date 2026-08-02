-- Core platform + Better Auth tables (pg). Prefer `bun run db:generate` after
-- schema edits; this bootstrap keeps a fresh clone migratable without a
-- generate step. Enable RLS on platform tables; policies reference starter_app.

CREATE TABLE IF NOT EXISTS "user" (
	id text PRIMARY KEY,
	name text NOT NULL,
	email text NOT NULL UNIQUE,
	email_verified boolean DEFAULT false NOT NULL,
	image text,
	created_at timestamp DEFAULT now() NOT NULL,
	updated_at timestamp DEFAULT now() NOT NULL,
	role text,
	banned boolean DEFAULT false,
	ban_reason text,
	ban_expires timestamp,
	two_factor_enabled boolean DEFAULT false,
	stripe_customer_id text,
	tokens_revoked_at timestamp,
	locale text
);

-- is_admin(): service GUC bypass OR user.role in (admin, superadmin).
-- Must live after "user" exists — SQL functions validate relations at CREATE.
CREATE OR REPLACE FUNCTION app_private.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT COALESCE(current_setting('app.service', true), '') = 'true'
    OR EXISTS (
        SELECT 1
        FROM public."user" AS u
        WHERE u.id = app_private.current_user_id()
        AND u.role IN ('admin', 'superadmin')
    );
$$;

REVOKE ALL ON FUNCTION app_private.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.is_admin() TO starter_app;

CREATE TABLE IF NOT EXISTS "session" (
	id text PRIMARY KEY,
	expires_at timestamp NOT NULL,
	token text NOT NULL UNIQUE,
	created_at timestamp DEFAULT now() NOT NULL,
	updated_at timestamp NOT NULL,
	ip_address text,
	user_agent text,
	user_id text NOT NULL REFERENCES "user"(id) ON DELETE cascade,
	impersonated_by text
);
CREATE INDEX IF NOT EXISTS session_userId_idx ON "session" (user_id);

CREATE TABLE IF NOT EXISTS "account" (
	id text PRIMARY KEY,
	account_id text NOT NULL,
	provider_id text NOT NULL,
	user_id text NOT NULL REFERENCES "user"(id) ON DELETE cascade,
	access_token text,
	refresh_token text,
	id_token text,
	access_token_expires_at timestamp,
	refresh_token_expires_at timestamp,
	scope text,
	password text,
	created_at timestamp DEFAULT now() NOT NULL,
	updated_at timestamp NOT NULL
);
CREATE INDEX IF NOT EXISTS account_userId_idx ON "account" (user_id);

CREATE TABLE IF NOT EXISTS "verification" (
	id text PRIMARY KEY,
	identifier text NOT NULL,
	value text NOT NULL,
	expires_at timestamp NOT NULL,
	created_at timestamp DEFAULT now() NOT NULL,
	updated_at timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS verification_identifier_idx ON "verification" (identifier);

CREATE TABLE IF NOT EXISTS "jwks" (
	id text PRIMARY KEY,
	public_key text NOT NULL,
	private_key text NOT NULL,
	created_at timestamp NOT NULL,
	expires_at timestamp
);

CREATE TABLE IF NOT EXISTS "oauth_client" (
	id text PRIMARY KEY,
	client_id text NOT NULL UNIQUE,
	client_secret text,
	disabled boolean DEFAULT false,
	skip_consent boolean,
	enable_end_session boolean,
	subject_type text,
	scopes text[],
	user_id text REFERENCES "user"(id) ON DELETE cascade,
	created_at timestamp,
	updated_at timestamp,
	name text,
	uri text,
	icon text,
	contacts text[],
	tos text,
	policy text,
	software_id text,
	software_version text,
	software_statement text,
	redirect_uris text[] NOT NULL,
	post_logout_redirect_uris text[],
	token_endpoint_auth_method text,
	grant_types text[],
	response_types text[],
	public boolean,
	type text,
	require_pkce boolean,
	reference_id text,
	metadata jsonb
);
CREATE INDEX IF NOT EXISTS "oauthClient_userId_idx" ON "oauth_client" (user_id);

CREATE TABLE IF NOT EXISTS "oauth_refresh_token" (
	id text PRIMARY KEY,
	token text NOT NULL UNIQUE,
	client_id text NOT NULL REFERENCES "oauth_client"(client_id) ON DELETE cascade,
	session_id text REFERENCES "session"(id) ON DELETE set null,
	user_id text NOT NULL REFERENCES "user"(id) ON DELETE cascade,
	reference_id text,
	expires_at timestamp,
	created_at timestamp,
	revoked timestamp,
	auth_time timestamp,
	scopes text[] NOT NULL
);

CREATE TABLE IF NOT EXISTS "oauth_access_token" (
	id text PRIMARY KEY,
	token text UNIQUE,
	client_id text NOT NULL REFERENCES "oauth_client"(client_id) ON DELETE cascade,
	session_id text REFERENCES "session"(id) ON DELETE set null,
	user_id text REFERENCES "user"(id) ON DELETE cascade,
	reference_id text,
	refresh_id text REFERENCES "oauth_refresh_token"(id) ON DELETE cascade,
	expires_at timestamp,
	created_at timestamp,
	scopes text[] NOT NULL
);

CREATE TABLE IF NOT EXISTS "oauth_consent" (
	id text PRIMARY KEY,
	client_id text NOT NULL REFERENCES "oauth_client"(client_id) ON DELETE cascade,
	user_id text REFERENCES "user"(id) ON DELETE cascade,
	reference_id text,
	scopes text[] NOT NULL,
	created_at timestamp,
	updated_at timestamp
);

CREATE TABLE IF NOT EXISTS "passkey" (
	id text PRIMARY KEY,
	name text,
	public_key text NOT NULL,
	user_id text NOT NULL REFERENCES "user"(id) ON DELETE cascade,
	credential_id text NOT NULL,
	counter integer NOT NULL,
	device_type text NOT NULL,
	backed_up boolean NOT NULL,
	transports text,
	created_at timestamp,
	aaguid text
);
CREATE INDEX IF NOT EXISTS passkey_userId_idx ON "passkey" (user_id);
CREATE INDEX IF NOT EXISTS passkey_credentialID_idx ON "passkey" (credential_id);

CREATE TABLE IF NOT EXISTS "two_factor" (
	id text PRIMARY KEY,
	secret text NOT NULL,
	backup_codes text NOT NULL,
	user_id text NOT NULL REFERENCES "user"(id) ON DELETE cascade,
	verified boolean DEFAULT true,
	failed_verification_count integer DEFAULT 0,
	locked_until timestamp
);
CREATE INDEX IF NOT EXISTS twoFactor_userId_idx ON "two_factor" (user_id);

CREATE TABLE IF NOT EXISTS "system_config" (
	key text PRIMARY KEY,
	value jsonb NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE "system_config" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_policy ON "system_config";
CREATE POLICY rls_policy ON "system_config" AS PERMISSIVE FOR ALL TO starter_app
	USING (app_private.is_admin()) WITH CHECK (app_private.is_admin());

CREATE TABLE IF NOT EXISTS "admin_action" (
	id text PRIMARY KEY,
	actor_id text REFERENCES "user"(id) ON DELETE set null,
	action text NOT NULL,
	target_type text,
	target_id text,
	detail jsonb,
	created_at timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS admin_action_created_idx ON "admin_action" (created_at DESC);
ALTER TABLE "admin_action" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_policy ON "admin_action";
CREATE POLICY rls_policy ON "admin_action" AS PERMISSIVE FOR ALL TO starter_app
	USING (app_private.is_admin()) WITH CHECK (app_private.is_admin());

CREATE TABLE IF NOT EXISTS "purchase" (
	id text PRIMARY KEY,
	user_id text NOT NULL REFERENCES "user"(id) ON DELETE cascade,
	provider text NOT NULL,
	external_id text NOT NULL,
	amount text NOT NULL,
	currency text NOT NULL DEFAULT 'usd',
	status text NOT NULL DEFAULT 'pending',
	metadata jsonb,
	paid_at timestamptz,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS purchase_provider_external_uq ON "purchase" (provider, external_id);
CREATE INDEX IF NOT EXISTS purchase_userId_idx ON "purchase" (user_id);
ALTER TABLE "purchase" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_user_read ON "purchase";
DROP POLICY IF EXISTS rls_service_write ON "purchase";
CREATE POLICY rls_user_read ON "purchase" AS PERMISSIVE FOR SELECT TO starter_app
	USING (app_private.is_admin() OR user_id = app_private.current_user_id());
CREATE POLICY rls_service_write ON "purchase" AS PERMISSIVE FOR ALL TO starter_app
	USING (app_private.is_admin()) WITH CHECK (app_private.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO starter_app;
