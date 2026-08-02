# TanStack Starter docs

Domain language and decisions for this scaffold. Use glossary terms in specs, issues, and code.

| Doc | Purpose |
|---|---|
| [`../CONTEXT.md`](../CONTEXT.md) | Ubiquitous language (glossary + invariants) |
| [`adr/`](./adr/) | Architectural decision records |
| [`specs/`](./specs/) | Implementation specs (PRD-style) |

## ADRs

| ADR | Title |
|---|---|
| [0001](./adr/0001-platform-only-generic-saas-starter.md) | Platform-only generic SaaS starter (+ extraction fidelity) |
| [0002](./adr/0002-oauth-issuer-always-on.md) | OAuth/OIDC issuer always on (+ metadata & search integrity) |
| [0003](./adr/0003-admin-roles-peer-protection-and-user-role-source-of-truth.md) | Admin roles, peer protection, `user.role` source of truth |
| [0004](./adr/0004-purchase-hook-not-wallet-or-subscription.md) | Purchase adapters + paid hook (no wallet/subscription product) |
| [0005](./adr/0005-full-app-i18n-url-and-user-locale.md) | Full-app i18n: URL prefixes (all HTML) + allowlist + `user.locale` |
| [0006](./adr/0006-postgres-hyperdrive-and-rls-skeleton.md) | Postgres + Hyperdrive + RLS skeleton |
| [0007](./adr/0007-base-ui-and-structural-shell.md) | Base UI composed controls + structural shell |
| [0008](./adr/0008-hardened-account-security-core.md) | Hardened account-security core |
| [0009](./adr/0009-cloudflare-email-only.md) | Cloudflare Email only |
| [0010](./adr/0010-request-pipeline-load-bearing-contracts.md) | Request pipeline load-bearing contracts |
| [0011](./adr/0011-platform-hygiene-and-pinned-toolchain.md) | Platform hygiene scripts and pinned toolchain |

## Specs

| Spec | Title |
|---|---|
| [2026-08-01-platform-capabilities.md](./specs/2026-08-01-platform-capabilities.md) | Platform capabilities baseline (catalog) |
| [2026-08-02-platform-alignment-extraction.md](./specs/2026-08-02-platform-alignment-extraction.md) | **Alignment remediation** — extract, don’t invent (draft for review) |

## Notes

- These docs ship with the open template. Keep them free of private product names, internal monorepo paths, and non-public operational detail.
- Platform work follows **extraction fidelity** (`CONTEXT.md`): strip product domain from proven patterns; do not invent parallel pipeline/UI/i18n semantics.
- Active fix list for drift: the 2026-08-02 alignment spec (Phases 0–3). Approve that draft before agent implementation.
