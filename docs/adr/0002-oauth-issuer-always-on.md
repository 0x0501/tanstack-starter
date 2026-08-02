# OAuth / OIDC issuer is always on

## Status

Accepted — 2026-08-01.  
Amended — 2026-08-02 (metadata and search integrity).

## Context

Many SaaS starters only need social login (OAuth *consumer*). First-party apps and CLIs often also need the app itself to act as an OAuth 2.0 / OIDC *issuer* (consent, JWKS, admin-managed clients). Getting that right on Cloudflare Workers is easy to get wrong once and expensive to re-learn per product.

Issuer bugs that look “starter-small” are still production breakages: empty protected-resource metadata, access-token TTL constants that disagree with issuer config, and router search serialization that turns multi-value OAuth parameters into JSON arrays and breaks signatures.

## Decision

The Starter always includes the **OAuth provider (issuer)** surface: discovery metadata, consent page, JWKS, token issuance via the OAuth flow (not a session→JWT shortcut), and admin **OAuth Apps**. Social login (GitHub) remains separate and is also shipped.

Dynamic client registration stays off; end users cannot self-register OAuth clients — administrators manage them.

Additionally:

1. **Protected-resource and authorization-server metadata** advertise real issuer/audience values derived from app origin helpers. Empty WIP payloads must not ship while routes are linked.
2. **Access token lifetime** is a single constant shared by issuer config and any exported TTL helper.
3. **Router search stringification** preserves repeated keys so Better Auth signed OAuth queries survive navigation (see ADR 0010).
4. Consent and sign-in must forward the signed OAuth query; locale switching must not drop it.

## Considered options

- Consumer-only (strip issuer) — loses the IdP surface every clone would otherwise reimplement.
- Issuer optional/flagged — thinner for some clones, but the freeze prioritizes always-on IdP over minimalism.
- Issuer-only product — conflicts with generic SaaS starter scope.

## Consequences

- Every clone ships IdP routes and tables even if unused; stripping is a clone-time delete, not a feature flag product.
- JWKS must work on Cloudflare Workers (in-process / cache patterns where self-fetch loops fail).
- Consent page is a required standard page, not demo chrome.
- Tests should cover search round-trip and metadata shape for the issuer surface.
