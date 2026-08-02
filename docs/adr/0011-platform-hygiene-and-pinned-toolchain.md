# Platform hygiene scripts and pinned toolchain

## Status

Accepted — 2026-08-02.

## Context

Mature Worker SaaS codebases prevent whole classes of regression with static checks and pinned toolchains: mutating server functions drifting to GET, raw SQL bypassing RLS helpers, server symbols leaking into the client bundle, and unpinned `"latest"` dependencies making every install a different product. A template that ships only `biome check` and floating versions will regress silently.

## Decision

1. **Pin** runtime framework packages (TanStack Start/Router/Query and related) to concrete versions. Do not use `"latest"` for platform packages.
2. Align **Better Auth** core and official plugins on the same minor line.
3. Default quality script runs:
   - format/lint
   - **server-fn contract** check (mutating handlers are not GET-by-default)
   - **sql-raw** check (forbid unsafe patterns / require approved helpers)
   - after build: **client-bundle** check with markers including server-function and Node built-in leakage
4. **Deploy path** validates production environment (required secrets/bindings) before or as part of deploy; prefer production build mode and a secrets file or documented wrangler secrets contract.
5. **Local data plane** ports and credentials in Docker Compose, env examples, and Hyperdrive `localConnectionString` must agree.
6. Ignore production env files in VCS (e.g. `.env.prod`).
7. TypeScript path aliases match package import maps (`@/*` and `#/*` when both are used).

## Consequences

- Slightly more scripts to maintain; large reduction in silent production footguns.
- Clone authors get a boring, reproducible install.
- Agents must not “simplify” the template by deleting these checks without a superseding ADR.
