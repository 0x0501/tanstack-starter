# AGENTS.md

Guidance for agents and developers working in this repo. Keep changes minimal and idiomatic to the surrounding code.

Important:

- Do not preserve backward compatibility. Remove obsolete paths instead of adding compatibility layers, fallbacks, or migrations.
- Choose the simplest implementation that fully meets the current requirements. Avoid speculative abstractions, configuration, and indirection.
- Grow the system in layers. Start from the smallest version that works end to end, and add each new capability on top of a product that already works. Never trade a working product for unfinished complexity.
- Keep components modular and concerns clearly separated.
- Prefer established, well-maintained libraries when they reduce overall complexity or improve reliability. Do not reimplement common functionality without a clear reason.
- Lean on the dependencies already in the project before writing your own implementation or adding packages. Do not assume a library lacks a capability without checking its documentation and types.
- Make architectural decisions for the long term. Do not accept a stopgap that only works for now and is meant to be replaced later.

## What this is

A TanStack Start template that runs on Cloudflare Workers, using Better Auth as a self-hosted **OAuth 2.0 / OIDC identity provider** (it *issues* tokens to clients — it is not a social-login consumer). Data lives in PostgreSQL, reached from the Worker through the Cloudflare Hyperdrive binding via Drizzle ORM.

## Stack

- **Framework**: TanStack Start (React 19, TanStack Router file-based routing, SSR)
- **Runtime**: Cloudflare Workers (`nodejs_compat`), deployed with Wrangler
- **Database**: PostgreSQL via Drizzle ORM (`drizzle-orm/node-postgres` + `pg`). The Worker reaches it through the `HYPERDRIVE` binding; local dev runs Postgres in Docker Compose.
- **Auth**: Better Auth (`better-auth`, `@better-auth/oauth-provider`, `@better-auth/passkey`, `@better-auth/drizzle-adapter`)
- **Server state**: TanStack Query
- **Email**: react-email templates rendered and sent via the Cloudflare `send_email` binding
- **Captcha**: Cloudflare Turnstile (Better Auth captcha plugin)
- **i18n**: Paraglide JS (inlang) — messages in `project.inlang/messages`
- **UI**: Base UI (`@base-ui/react`) composed controls; Tailwind CSS v4 for styling
- **Tooling**: Bun, Biome (lint/format), Vitest (+ Testcontainers), Playwright, T3Env

## Commands

Package manager is **bun**.

| Command | What |
|---|---|
| `bun run dev` | Dev server on :3000 |
| `bun run build` | Production build |
| `bun run deploy` | `validate-prod-env` → prod build → client-bundle check → `wrangler deploy` |
| `bun run test` | Vitest — **needs Docker**, Testcontainers starts Postgres for the suite |
| `bun run test:unit` | Vitest with `SKIP_TESTCONTAINERS=1` (no database seams) |
| `bun run test:e2e` | Playwright (`e2e/`) |
| `bun run check` | Biome check + `check:sql-raw` + `check:server-fns` |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run generate-routes` | Regenerate `src/routeTree.gen.ts` (after adding/removing/moving routes) |
| `bun run auth:generate` | Regenerate the Better Auth Drizzle schema from `src/lib/auth.ts` |
| `bun run db:up` / `db:down` / `db:reset` | Local Postgres container from `.env.docker` (`db:reset` wipes the volume) |
| `bun run db:generate` | Generate Drizzle migrations into `./drizzle` |
| `bun run db:migrate` / `db:push` | Apply migrations / push schema to Postgres |
| `bun run db:seed` | Seed a local superadmin + user |
| `bun run db:studio` | Drizzle Studio |

## Environment

Validated in `src/env.ts` via T3Env; import with `import { env } from "@/env"`. Copy `.env.example` → `.env`.

- Required: `APP_ORIGIN`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` (`bunx auth@latest secret`), `EMAIL_FROM`.
- Optional: `SERVER_URL`, `BETTER_AUTH_AUDIENCES`, `TURNSTILE_SECRET_KEY` + `VITE_TURNSTILE_SITE_KEY` (captcha stays off when unset), `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` / `VITE_GITHUB_CLIENT_ID`, the `CREEM_*` / `STRIPE_*` / `NOW_PAYMENTS_*` payment keys, `VITE_APP_TITLE`, `VITE_APP_ORIGIN`.
- Database URLs are **not** in `src/env.ts`. drizzle-kit and `db:seed` read `DATABASE_MIGRATION_URL` (privileged, direct) from `.env` / `.env.local` via `drizzle.config.ts`; the Worker only ever gets the `HYPERDRIVE` binding from `wrangler.jsonc`. Never point the runtime at the migration URL.

Server-only values (`cloudflare:workers`, `env.HYPERDRIVE`) must never reach client bundles — touch them only inside `server` handlers / middleware. `bun run check:client-bundle` scans `dist/client` for exactly that leak.

## Structure

- `src/lib/auth.ts` — Better Auth server config (`createAuth(db)`); all plugins live here.
- `src/lib/auth-plugins/` — the Starter's own Better Auth plugins (`existing-email-signup`, `field-rules`, `social-two-factor`).
- `src/lib/auth-paths.ts` — `DISABLED_AUTH_PATHS` / `CAPTCHA_ENDPOINTS`, kept binding-free so tests can assert them against a real auth instance.
- `src/lib/auth-client.ts` — Better Auth React client.
- `src/lib/email.tsx` — verification / reset / OTP mail, rendered from `src/integrations/react-email/*`.
- `src/db/` — `index.ts` (`createDB` over the Hyperdrive connection string), `schema.ts` (barrel, `export *`), `auth.schema.ts` (generated), `platform.schema.ts` (hand-written platform tables), `helper.ts` (RLS transaction scopes).
- `src/middlewares/` — `database.ts` (Drizzle from `env.HYPERDRIVE`) → `better-auth.ts` (auth from db); plus `admin`, `protected`, `body-limit`, `auth-rate-limit`.
- `src/routes/` — file-based routes (see Auth routes below).
- `src/services/` — business / domain logic, framework-agnostic (imported by routes, server functions, middleware).
- `src/server/` — TanStack Start server functions (`createServerFn`), the single home for all of them.
- `src/__tests__/` — all Vitest files (`*.test.ts` / `*.test.tsx`). `e2e/` — Playwright specs.
- `src/env.ts` — env schema. `src/router.tsx` — router + Query wiring. `src/server.ts` — Worker entry (Paraglide + Start).
- `scripts/` — hygiene checks (`check-*.ts`), `seed-local.ts`, `validate-prod-env.ts`, `postgres/` init scripts.

## Authentication

`createAuth(db)` in `src/lib/auth.ts` configures Better Auth with:

- email + password (`requireEmailVerification: true`) and email verification, both emailing via `src/lib/email.tsx`;
- GitHub social sign-in, mounted only when `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are both set;
- plugins: `jwt()`, `oauthProvider(...)` (OAuth2/OIDC provider), `captcha` (Turnstile, mounted only when a secret key is configured), `admin()`, `twoFactor()`, `emailOTP()`, `passkey()`, the local `existingEmailSignup()` / `fieldRules()` / `socialTwoFactor()`, and `tanstackStartCookies()` **last**.

`disabledPaths: [...DISABLED_AUTH_PATHS]` (`src/lib/auth-paths.ts`) 404s every Better Auth HTTP route whose own checks would bypass a Starter guard: the jwt plugin's session→JWT `/token` shortcut (so tokens are only issued through the OAuth flow), plus the email-OTP, 2FA-management, admin-plugin and credential-mutation paths. Server-side `auth.api.*` still reaches all of them, which is how the app calls every one.

### OAuth / OIDC provider flow

Endpoints are mounted by the catch-all `src/routes/api/auth/$.ts` (`auth.handler`), plus explicit metadata routes at their RFC-correct paths:

- OIDC discovery: `/api/auth/.well-known/openid-configuration`
- OAuth AS metadata (RFC 8414): `/.well-known/oauth-authorization-server/api/auth`
- Protected-resource metadata (RFC 9728): `/.well-known/oauth-protected-resource`

Interactive pages (referenced from the `oauthProvider` options):

- `loginPage: "/sign-in"` — `src/routes/sign-in.tsx`. General login page; when reached mid-authorize it carries the **signed** query, so after login it navigates back to `/api/auth/oauth2/authorize?<query>` to resume (falls back to `?redirect` / home otherwise).
- `consentPage: "/oauth/consent"` — `src/routes/oauth/consent.tsx`. Must forward the signed query as `oauth_query` to `authClient.oauth2.consent`, or the server rejects with "missing oauth query".

Both pages use a pass-through `validateSearch` so the signed query stays in the URL, and read `window.location.search` for the faithful signed string.

### Schema workflow (important)

`src/db/auth.schema.ts` is **generated from the auth config**, not hand-edited. After changing plugins/fields in `src/lib/auth.ts`:

1. `bun run auth:generate` — regenerates `auth.schema.ts` (jwt `jwks`; oauth-provider `oauthClient` / `oauthAccessToken` / `oauthRefreshToken` / `oauthConsent`; `twoFactor`; `passkey`; admin fields on `user`).
2. `bun run db:generate`, then `bun run db:migrate`.

`src/db/schema.ts` must `export *` from both `auth.schema.ts` and `platform.schema.ts` (not a bare `import`) — Drizzle and drizzle-kit read the tables through it. Platform tables you own by hand go in `platform.schema.ts`; never hand-edit `auth.schema.ts`.

## Conventions

- Biome, **tabs**, double quotes. Run `bun run check` and `bun run typecheck` before finishing.
- Path aliases: `@/*` and `#/*` both map to `src/*`.
- **State-changing server functions declare `method: "POST"`** and validate their input — `check:server-fns` fails the build otherwise. Pure reads stay on GET so loaders keep prefetching.
- **No `sql.raw`** in `src/` — `check:sql-raw` forbids it. A raw interpolation on the app connection can `set_config` the `app.service` GUC and escalate past RLS. Static constants need an auditable `sql-raw-ok` annotation.
- Database work that must respect RLS goes through `withRlsUser` / `withRlsService` in `src/db/helper.ts`, not a bare `db` handle.
- Add/move a route → run `bun run generate-routes`, and **commit the result**. Escape a leading dot in route folders as `[.]` (e.g. `[.]well-known`).
  - `dev` and `build` regenerate the tree too, via the Start plugin. The plugin appends a `declare module '@tanstack/react-start'` footer that the standalone `tsr` CLI knows nothing about, so `tsr.config.json` carries a hand-copy of it under `routeTreeFileFooter` to keep both generators byte-identical. CI diffs the tree after `build`; if a TanStack upgrade changes that footer, that diff is where it surfaces — update `tsr.config.json` to match.
- Keep `tanstackStartCookies()` last in the Better Auth plugins array.
- **Tests** go in `src/__tests__/` (`*.test.ts[x]`) — not colocated next to source.
- **Business/domain logic** goes in `src/services/`, kept framework-agnostic; `src/lib/` is only for framework glue and config.
- **Server functions** (`createServerFn`) go in `src/server/` — keep them thin and delegate to `src/services/`.
