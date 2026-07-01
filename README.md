# TanStack Start + Cloudflare + Better Auth

A production-shaped template: **TanStack Start** on **Cloudflare Workers**, with **Better Auth** configured as a self-hosted **OAuth 2.0 / OIDC provider**, **Cloudflare D1 + Drizzle ORM**, transactional email, Turnstile captcha, and i18n.

## Features

- TanStack Start (React 19, file-based routing, SSR) on Cloudflare Workers
- Better Auth: email/password with verification, JWT, admin, Turnstile captcha, and a full OAuth2/OIDC **provider** (`/oauth2/authorize`, consent, token, discovery)
- Cloudflare D1 (SQLite) via Drizzle ORM
- Transactional email through the Cloudflare `send_email` binding (react-email templates)
- Paraglide i18n, Tailwind CSS v4, Biome, Vitest, T3Env

## Getting started

```bash
bun install
cp .env.example .env
bunx --bun @better-auth/cli secret   # paste the value into BETTER_AUTH_SECRET
bun run dev                          # http://localhost:3000
```

Required env vars (validated in `src/env.ts`):

| Var | Purpose |
|---|---|
| `BETTER_AUTH_URL` | App origin, e.g. `http://localhost:3000` |
| `BETTER_AUTH_SECRET` | Auth signing secret |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile secret |
| `EMAIL_FROM` | Verified sender for Cloudflare Email |

## Database (Cloudflare D1 + Drizzle)

The auth tables are **generated from the Better Auth config**, not hand-written:

```bash
bun run auth:generate   # src/lib/auth.ts  ->  src/db/auth.schema.ts
bun run db:generate     # migrations into ./drizzle
bun run db:migrate      # apply to D1
```

Re-run `auth:generate` whenever you change plugins/fields in `src/lib/auth.ts`. For remote `db:push`/`db:migrate`, also set `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_DATABASE_ID`, and `CLOUDFLARE_D1_TOKEN` (see `drizzle.config.ts`); `db:generate` needs none of them.

## Authentication & OAuth provider

Config lives in `src/lib/auth.ts`. This app *is* an identity provider — other apps can authenticate against it over OAuth2/OIDC.

- Login page: `src/routes/sign-in.tsx` (also serves as the OAuth `loginPage`)
- Consent page: `src/routes/oauth/consent.tsx`
- Discovery / metadata: `/api/auth/.well-known/openid-configuration`, `/.well-known/oauth-authorization-server/api/auth`, `/.well-known/oauth-protected-resource`

See [AGENTS.md](./AGENTS.md) for the full auth architecture and flow.

## Scripts

| Command | What |
|---|---|
| `bun run dev` / `build` / `deploy` | develop / build / build + `wrangler deploy` |
| `bun run test` | Vitest |
| `bun run check` | Biome lint + format |
| `bun run generate-routes` | regenerate the route tree |

## Deploy to Cloudflare

```bash
npm install -g wrangler
wrangler login
bun run deploy
```

Bindings (D1 `DB`, `send_email` `EMAIL`) are declared in `wrangler.jsonc`. Add production secrets with `wrangler secret put <NAME>` for each entry in `.env.example`.

## Project layout

- `src/routes/` — pages + API routes (`api/auth/$.ts` mounts Better Auth)
- `src/lib/` — `auth.ts`, `auth-client.ts`, `email.tsx`
- `src/db/` — Drizzle setup + generated schema
- `src/middlewares/` — DB + auth request middleware
- `messages/`, `project.inlang/` — i18n

## Learn more

[TanStack Start](https://tanstack.com/start) · [Better Auth](https://www.better-auth.com) · [Drizzle](https://orm.drizzle.team) · [Cloudflare Workers](https://developers.cloudflare.com/workers/)
