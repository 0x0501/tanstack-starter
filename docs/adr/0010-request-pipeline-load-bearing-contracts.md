# Request pipeline load-bearing contracts

## Status

Accepted — 2026-08-02.

## Context

TanStack Start on Cloudflare Workers has several failure modes that only appear when pieces are omitted: locale 307 loops when the router receives an already de-localized URL; OAuth `invalid_signature` when multi-value search keys are JSON-encoded; client query caches treating HTTP refusals as successful data when `HttpError` loses its status on the wire; personalized HTML poisoned when Workers cache ignores cookies; Node built-ins (`async_hooks`) exploding when server-only modules enter the client graph.

A “minimal” Start entry that keeps only CSRF is not a safe subset of a mature platform pipeline.

## Decision

The Starter’s request pipeline always includes these contracts:

1. **HttpError serialization** on the Start instance so server-function refusals keep `status` / `error` across the wire; query defaults treat 4xx as non-retryable and route 401 to sign-in.
2. **Paraglide middleware** sets ambient locale; the framework handler always receives the **original** Request (router rewrite performs de-/re-localization).
3. **Router**: `trailingSlash: "preserve"`; rewrite via de-/localize helpers; **search stringification** that preserves repeated keys for OAuth.
4. **Paraglide URL patterns** allowlist **all user-facing HTML** (public, auth, dashboard, admin) under locale prefixes, with an **identity catch-all** so `/api/*` and `/.well-known/*` are never locale-prefixed (see ADR 0005).
5. **Workers cache** does not store personalized SSR HTML by URL alone (`cache.enabled: false` or equivalent).
6. **Baseline security headers** on Worker responses; any CSP nonce helper must remain client-safe (no Node built-ins in the browser graph).
7. **Client-bundle boundary checks** run after production builds and fail on server-only leakage.

Optional production env fail-closed on Worker fetch and auth HTTP rate limiting are platform hygiene (ADR 0011) and should be treated as required for production-ready clones.

## Consequences

- Start/router/server entry files stay thin but are not free to “simplify away” the contracts above.
- New middleware must justify itself against this list; inventing alternate locale or error buses is non-compliant.
- Tests should lock HttpError wire behavior, search round-trip, and non-localization of API paths.
