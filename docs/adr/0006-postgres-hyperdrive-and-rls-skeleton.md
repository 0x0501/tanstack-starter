# Postgres + Hyperdrive only, with an RLS skeleton

## Status

Accepted — 2026-08-01.

## Context

Dual sqlite/pg (or D1) adapters rot schemas and migrations. Production on Cloudflare Workers needs Hyperdrive → Postgres and a clear RLS pattern so product tables do not invent a second security model.

## Decision

1. **PostgreSQL only.** Better Auth Drizzle adapter uses `provider: "pg"`.
2. **Production** database access is **Cloudflare Hyperdrive**. Migrations use a direct `DATABASE_MIGRATION_URL` (or equivalent) outside Hyperdrive.
3. **No** sqlite path, **no** D1 as default.
4. Ship an **RLS skeleton**: app database role, session GUCs for current user / service scope, `is_admin()` reading `user.role`, policies on platform tables only. Product tables and policies are clone-time.
5. Local dev requires Postgres (Docker, Neon, Supabase local, etc.) — documented, not forked away.

## Consequences

- Clone setup is heavier than a local sqlite file, but one schema forever.
- Server handlers that need admin/config reads must use the **service** transaction pattern where RLS would hide rows (user-scoped config reads look identical to “no override”).
- Never hold a row lock across a Better Auth API call on another connection (deadlock risk when the plugin connection blocks on an uncommitted lock).
