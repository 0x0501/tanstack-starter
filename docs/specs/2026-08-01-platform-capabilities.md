# Spec: Platform capabilities for the TanStack Starter

**Status:** Living baseline — capability catalog  
**Date:** 2026-08-01  
**Glossary:** `CONTEXT.md`  
**ADRs:** `docs/adr/0001`–`0011`  

**Remediation:** Implementation drifted from extraction fidelity (invented UI/i18n layers; missing pipeline contracts). Alignment work is specified in [`2026-08-02-platform-alignment-extraction.md`](./2026-08-02-platform-alignment-extraction.md). Prefer that spec for “what to fix now”; this document remains the capability catalog and non-goals list.

---

## Problem Statement

A TanStack Start + Cloudflare Workers scaffold should be a cloneable base for new products. Without a hardened platform layer—Better Auth on Workers, OAuth issuer/JWKS, Hyperdrive + Postgres RLS, Cloudflare Email, Turnstile, optional multi-rail payments, peer-safe admin, and standard auth/admin pages—every product re-learns the same bugs. The Starter must ship that platform only, without any single product’s domain.

---

## Solution

Ship a **generic SaaS Starter** that includes:

1. **Hardened Better Auth** — email/password, GitHub, 2FA, passkey, OAuth/OIDC **issuer**, Turnstile, disabled dangerous plugin HTTP routes, account-security server flows.
2. **Roles** — `user` / `admin` / `superadmin` with peer protection; authority on `user.role`; first Superadmin via SQL.
3. **Postgres + Hyperdrive** with an **RLS skeleton** (no sqlite).
4. **Cloudflare Email** + react-email templates (brand via env).
5. **Optional payment provider adapters** (Stripe, Creem, NowPayments) → **Purchase** + **purchase-paid hook** (no wallet, no subscription product).
6. **Standard pages** — sign-in, sign-up, forgot/reset password, 2FA challenge, OAuth consent.
7. **User dashboard** — `/dashboard` overview + account.
8. **Admin console** — `/admin` Users, Audit Log, OAuth Apps.
9. **UI** — Base UI controls + structural shell only.
10. **Full-app i18n** — Paraglide messages **and** URL prefixes for public, auth, dashboard, and admin; machine paths unprefixed; `user.locale`; locales `en` + `de`.
11. **Worker lessons** — JWKS usable on Workers, body-limited webhooks, client-bundle boundaries, server-fn POST contract, session cookie-cache bounds.

---

## Explicit out of scope

- Product domain: wallets, ledgers, referral, marketplace providers, API-key products for gateways, routing meshes, withdrawals, model pricing.
- SaaS subscription billing product (plans, proration, customer portal as platform product).
- Additional social providers beyond GitHub as defaults.
- Multi-email production transports (Resend, SMTP).
- SQLite / D1 dual support.
- Separate admin membership table or dual-write roles.
- Env/first-user automatic Superadmin promotion.
- Full auth SIEM.
- Brand design system / HeroUI.
- zh locales as Starter defaults (clones may add; in-tree is en+de).
- Better Auth **api-key** plugin as a Starter default (omit unless a clone needs a generic key product).

---

## Testing seams (contract)

| Seam | Responsibility |
|---|---|
| **Request pipeline** | HttpError wire, Paraglide + original Request, router rewrite/search/trailing-slash, URL allowlist, client-bundle boundary |
| **Auth factory** | Auth configuration, plugins, disabled paths, captcha endpoints, issuer TTL/metadata consistency |
| **Auth HTTP + pages** | Rate limit, Turnstile/social/passkey UI parity, consent query integrity |
| **Account security** | OTP password change, 2FA lifecycle, passkey/unlink freshness, session eviction helpers |
| **Admin security** | Peer protection, last-admin |
| **Purchase fulfillment** | Idempotent mark paid + single hook invocation |
| **Payment adapters** | Verify webhook/IPN → map to purchase service |
| **RLS helpers** | Service/user transaction entry points + policy integration |
| **Platform hygiene** | server-fn contract, sql-raw, client-bundle markers, prod env validation |

Ideal: product domain only depends on **purchase-paid hook** + **session/user identity**.

---

## Definition of done (platform)

- Postgres + Hyperdrive + RLS skeleton migrations (local ports consistent with Hyperdrive)
- Auth factory + disabled paths + email + Turnstile + core pages **with UI parity**
- Account-security flows + passkey + GitHub + social 2FA
- OAuth issuer well-known + real metadata + consent + JWKS Workers path + search integrity
- User dashboard overview/account
- Admin users + peer protection + audit
- Admin OAuth Apps
- Payment adapters + Purchase + hook + toggles + optional demo checkout
- Full-app i18n (en/de): messages + URL prefixes for public/auth/dashboard/admin; identity catch-all for `/api` and `/.well-known`; link-based locale switcher
- Request pipeline contracts (HttpError wire, original Request, trailing slash preserve)
- Composed Base UI + structural shell only (no second design system)
- Platform hygiene in `check` + prod env validation on deploy; pinned platform deps
- Tests for the pipeline and platform seams; README bootstrap; client-bundle check after build
- No private reference product names/paths in the shippable tree

Until the alignment remediation lands, treat incomplete items as open work under `2026-08-02-platform-alignment-extraction.md`.

---

## Worker / JWKS checklist

- Prefer in-process JWKS read + short cache for validators inside the same Worker.
- Do not rely on outbound fetch to own `/.well-known/jwks.json` from the same isolate without proving it works.
- JWT plugin `/token` session shortcut remains disabled if OAuth is the only issuance path.
- `nodejs_compat` and Hyperdrive as in current `wrangler.jsonc` patterns.
