# Admin roles: peer protection; `user.role` is the only source of truth

## Status

Accepted — 2026-08-01.

## Context

Dual sources of “who is admin” (a private membership table *and* Better Auth `user.role`) drift: RLS `is_admin()` can disagree with the UI, so a promoted admin still fails policies. Separately, capability-identical `admin` and `superadmin` labels allow one administrator to demote or ban another unless peer-protection guards exist. Better Auth’s own `/admin/*` HTTP routes only check plugin permissions and bypass app-level guards.

## Decision

1. Roles are **`user` | `admin` | `superadmin`** on Better Auth’s **`user.role` only**. No separate admin membership table. No dual-write.
2. **`admin` and `superadmin` are capability-identical.** Superadmin is a *protected label*, not a higher privilege tier.
3. **Peer protection:** no administrator may ban, demote, or revoke credentials of an `admin` or `superadmin`, nor change their own role. Last-admin safeguards apply where relevant.
4. **Bootstrap:** first Superadmin is granted by **operator SQL** (`UPDATE "user" SET role = 'superadmin' WHERE email = …`) — not env auto-promote, not first-user-wins.
5. Better Auth **admin plugin HTTP routes are disabled** at the router; admin operations go through server functions that call `auth.api.*` and enforce peer protection.

## Consequences

- RLS `is_admin()` (or equivalent) must read `user.role` for `admin` and `superadmin`.
- Tests must assert disabled admin HTTP surface and peer-protection behavior.
- Promoting Superadmin is an ops procedure documented in the README, not an open signup path.
