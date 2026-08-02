# Outbound mail is Cloudflare Email only

## Status

Accepted — 2026-08-01.

## Context

The Starter targets Cloudflare Workers. Multi-provider email (Resend, SMTP) adds config surface the stack does not need for a platform shell.

## Decision

Production outbound mail uses **Cloudflare Email** only (`send_email` binding). Templates are **react-email**. From **display name** is a clone-time brand string from environment configuration. An internal send helper exists so tests can inject a mock; no second production transport ships in-tree.

## Consequences

- Local/dev without the binding logs or uses a test sink (never log OTP cleartext outside development).
- Brand is never hard-coded as a product name in templates; use `EMAIL_FROM_NAME` (or equivalent).
