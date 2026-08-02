# Hardened account-security core (not stock Better Auth defaults alone)

## Status

Accepted — 2026-08-01.

## Context

Enabling Better Auth plugins is not the same as a production-hardened account-security model. Real deployments need app-level hooks, disabled HTTP paths, and server functions for cases such as: social sign-in skipping 2FA, re-signup password overwrite, admin HTTP bypass, passkey delete without freshness, password change that left other sessions alive, and GitHub without a verified email.

## Decision

The Starter treats the following as **platform law**, with tests:

1. **Verified email fail-closed** for GitHub; verified email is the notification channel.
2. **Safe re-registration** — no password overwrite; non-enumerating responses (with verification resend when appropriate).
3. **2FA** (TOTP + backup codes): password *and* social sign-in produce a **pending 2FA challenge** (no session until second factor); passkey exempt.
4. **Session eviction** on credential/second-factor change (acting browser kept except recovery).
5. **Password change via emailed OTP**, not current-password-only (supports passwordless GitHub users setting a first password).
6. **Fresh-session gates** for passkey add/remove and account unlink; re-auth with TOTP/backup or email OTP, never password-only for users without passwords.
7. **Display name only** — no username handle as identity field.
8. **Server-side field rules** (normalize, length, reject controls/bidi/zwj); harden free text, do not HTML-sanitize for JSX text nodes.
9. **Disabled auth paths** for plugin routes that bypass guards (admin HTTP, public email-OTP sign-in, password-gated 2FA management, credential mutations that skip eviction/freshness, jwt `/token` shortcut if issuer-only token path is desired).
10. **Turnstile** on an explicit endpoint list; captcha may be off in dev without site keys.
11. **Short re-auth at action time** for high-risk product mutations is documented as a pattern (`MONEY_REAUTH_MAX_AGE_SECONDS`), not shipped as product pages.

## Consequences

- Auth module is larger than plugin wiring; account-security server functions own gated mutations.
- Cookie session cache (if enabled) is a deliberate staleness bound; privileged paths may disable cache.
- Behavioral source of truth is this ADR, `CONTEXT.md`, and the Starter’s account-security tests/services.
