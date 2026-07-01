# AGENTS.md

Guidance for agents and developers working in this repo. Keep changes minimal and idiomatic to the surrounding code.

## What this is

A TanStack Start template that runs on Cloudflare Workers, using Better Auth as a self-hosted **OAuth 2.0 / OIDC identity provider** (it *issues* tokens to clients — it is not a social-login consumer). Data lives in Cloudflare D1 (SQLite) via Drizzle ORM.

## Stack

- **Framework**: TanStack Start (React 19, TanStack Router file-based routing, SSR)
- **Runtime**: Cloudflare Workers (`nodejs_compat`), deployed with Wrangler
- **Database**: Cloudflare D1 (SQLite) via Drizzle ORM (`drizzle-orm/d1`)
- **Auth**: Better Auth (`better-auth`, `@better-auth/oauth-provider`, `@better-auth/drizzle-adapter`)
- **Server state**: TanStack Query
- **Email**: react-email templates rendered and sent via the Cloudflare `send_email` binding
- **Captcha**: Cloudflare Turnstile (Better Auth captcha plugin)
- **i18n**: Paraglide JS (inlang) — messages in `project.inlang/messages`
- **Styling**: Tailwind CSS v4
- **Tooling**: Bun, Biome (lint/format), Vitest, T3Env

## Commands

Package manager is **bun**.

| Command | What |
|---|---|
| `bun run dev` | Dev server on :3000 |
| `bun run build` | Production build |
| `bun run deploy` | Build + `wrangler deploy` |
| `bun run test` | Vitest |
| `bun run check` | Biome lint + format check |
| `bun run generate-routes` | Regenerate `src/routeTree.gen.ts` (after adding/removing/moving routes) |
| `bun run auth:generate` | Regenerate the Better Auth Drizzle schema from `src/lib/auth.ts` |
| `bun run db:generate` | Generate Drizzle migrations into `./drizzle` |
| `bun run db:migrate` / `db:push` | Apply migrations / push schema to D1 |
| `bun run db:studio` | Drizzle Studio |

## Environment

Validated in `src/env.ts` via T3Env; import with `import { env } from "@/env"`. Copy `.env.example` → `.env`.

- Required: `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` (`bunx --bun @better-auth/cli secret`), `TURNSTILE_SECRET_KEY`, `EMAIL_FROM`.
- Optional: `SERVER_URL`, `CREEM_API_KEY`, `CREEM_WEBHOOK_SECRET`, `CREEM_TEST_MODE`, `VITE_APP_TITLE`.
- For remote Drizzle (`db:push`/`db:migrate`) also set `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_DATABASE_ID`, `CLOUDFLARE_D1_TOKEN` (see `drizzle.config.ts`). `db:generate` needs none of these.

Server-only values (`cloudflare:workers`, `env.DB`) must never reach client bundles — touch them only inside `server` handlers / middleware.

## Structure

- `src/lib/auth.ts` — Better Auth server config (`createAuth(db)`); all plugins live here.
- `src/lib/auth-client.ts` — Better Auth React client.
- `src/lib/email.tsx` — `sendVerificationEmail` / `sendResetPasswordEmail`, rendered from `src/integrations/react-email/*`.
- `src/db/` — `index.ts` (`createDB`), `schema.ts` (barrel, `export *`), `auth.schema.ts` (generated).
- `src/middlewares/` — `database.ts` (Drizzle from `env.DB`) → `better-auth.ts` (auth from db).
- `src/routes/` — file-based routes (see Auth routes below).
- `src/services/` — business / domain logic, framework-agnostic (imported by routes, server functions, middleware).
- `src/server/` — TanStack Start server functions (`createServerFn`), the single home for all of them.
- `src/__tests__/` — all test files (`*.test.ts` / `*.test.tsx`, Vitest).
- `src/env.ts` — env schema. `src/router.tsx` — router + Query wiring.

## Authentication

`createAuth(db)` in `src/lib/auth.ts` configures Better Auth with:

- email + password (`requireEmailVerification: true`) and email verification, both emailing via `src/lib/email.tsx`;
- plugins: `jwt()`, `oauthProvider(...)` (OAuth2/OIDC provider), `captcha` (Turnstile), `admin()`, and `tanstackStartCookies()` **last**.

`disabledPaths: ["/token"]` disables the jwt plugin's session→JWT shortcut so tokens are only issued through the OAuth flow.

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

1. `bun run auth:generate` — regenerates `auth.schema.ts` (jwt `jwks`; oauth-provider `oauthClient` / `oauthAccessToken` / `oauthRefreshToken` / `oauthConsent`; admin fields on `user`).
2. `bun run db:generate`, then apply migrations.

`src/db/schema.ts` must `export *` from `auth.schema.ts` (not a bare `import`) — Drizzle and drizzle-kit read the tables through it.

## Conventions

- Biome, **tabs**, double quotes. Run `bun run check` before finishing.
- Path aliases: `@/*` and `#/*` both map to `src/*`.
- Add/move a route → run `bun run generate-routes`. Escape a leading dot in route folders as `[.]` (e.g. `[.]well-known`).
- Keep `tanstackStartCookies()` last in the Better Auth plugins array.
- **Tests** go in `src/__tests__/` (`*.test.ts[x]`) — not colocated next to source.
- **Business/domain logic** goes in `src/services/`, kept framework-agnostic; `src/lib/` is only for framework glue and config.
- **Server functions** (`createServerFn`) go in `src/server/` — keep them thin and delegate to `src/services/`.
