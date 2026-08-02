# Spec: Platform alignment via faithful extraction

**Status:** Draft — awaiting human review  
**Date:** 2026-08-02  
**Glossary:** `CONTEXT.md`  
**ADRs:** `0001`–`0011` (see amendments and new ADRs from this work)  
**Supersedes partial claims in:** `2026-08-01-platform-capabilities.md` definition-of-done where implementation drifted  

---

## Problem Statement

The Starter’s purpose is to be a **cloneable generic SaaS platform**: take a mature production platform stack, strip product domain, and keep the hard-won platform patterns intact so new products do not re-learn the same Worker/auth/i18n/RLS bugs.

In practice the Starter has **drifted from that extraction model**:

1. **Invented layers** that the mature platform does not use (a second “neutral SaaS” token/class system, compound control APIs, ad-hoc shells, a different locale switcher, unpinned `"latest"` dependencies).
2. **Missing load-bearing platform contracts** that the mature platform already solved (HttpError wire serialization, OAuth multi-value search serialization, Paraglide URL allowlist + identity catch-all, auth UI parity with server plugins, rate limiting, production env/deploy gates, static security checks).
3. **Broken or contradictory defaults** that make the platform unsafe or unusable (local Hyperdrive port mismatch; OAuth access-token TTL constant vs issuer config; empty OAuth protected-resource metadata; captcha/social/passkey server-ready but UI incomplete; Tabs using the wrong Base UI state attribute).
4. **Documentation debt**: ADRs and CONTEXT describe the intended platform, but do not yet forbid inventiveness or name the extraction rule; i18n ADR over-simplifies URL strategy in a way that fights API and OAuth paths.

Clones and maintainers cannot tell whether a file is “proven platform” or “temporary rewrite.” That defeats the Starter’s reason to exist.

---

## Solution

Treat a **private mature reference platform** (never named in open docs or shippable comments) as the **source of structural truth** for platform capabilities. Work proceeds as:

1. **Extract, do not invent** — for each platform seam, copy the mature pattern with product domain and private identifiers removed; recolor structural CSS only.
2. **Delete inventiveness** — remove dead wrappers, dual APIs, unused dependencies, and parallel design systems.
3. **Restore load-bearing contracts** — wire serialization, OAuth search params, Paraglide URL patterns, auth page capability parity, security headers/cache policy, rate limits, check scripts, production env validation.
4. **Update CONTEXT + ADRs** so future agents default to extraction fidelity, not greenfield redesign.

After this work, a developer should be able to map every Starter platform module to a proven pattern, with only brand strings, locale set (`en`/`de`), and product-domain absences as deliberate differences.

---

## Seams (testing & ownership)

Prefer **existing** seams. Do not introduce new package boundaries. Ideal ownership remains the six platform seams plus two pipeline seams.

| Seam | Responsibility | Notes |
|---|---|---|
| **Request pipeline** | Start CSRF + HttpError serialization; Worker entry + Paraglide ambient locale; router rewrite / trailing slash / search stringify; baseline security headers; cache-off policy | Highest leverage; most inventiveness bugs live here |
| **Auth factory** | Better Auth config, plugins, disabled paths, captcha allowlist, OAuth issuer settings, access-token TTL consistency, user create/update guards | Align versions of core + plugins |
| **Auth HTTP + pages** | Auth catch-all route rate limit; sign-in/up/forgot/reset/2FA/consent UI parity with server capabilities | UI must not lag plugins |
| **Account security** | OTP password change, 2FA lifecycle, passkey/unlink freshness, session eviction | Already largely ported |
| **Admin security** | Peer protection, last-admin, audit | Keep; route shell may re-read role for mutations |
| **Purchase fulfillment** | Idempotent paid + single hook | Keep ADR 0004 |
| **Payment adapters** | Verify webhook/IPN → purchase service | Keep optional rails |
| **RLS helpers** | Service/user transaction scopes + app role | Keep skeleton |
| **UI shell** | Composed Base UI controls + structural shells only | **Delete** invented token class banks and dead components |
| **i18n surface** | Message catalogs + full-app URL prefixes + locale switcher + `user.locale` | Allowlist all HTML trees; never localize API/well-known |
| **Platform hygiene** | Client-bundle check, server-fn contract check, sql-raw check, prod env validate, pinned deps | Missing scripts are in scope |

**Primary seam for this spec:** **Request pipeline + extraction fidelity rule.** Secondary: UI shell delete/replace and auth page parity. Product-domain seams remain out of scope.

---

## User Stories

1. As a **clone author**, I want the Starter to contain only platform capabilities, so that I never unlearn foreign product domain.
2. As a **clone author**, I want platform patterns to match a battle-tested Worker stack, so that I do not rediscover 307 loops, OAuth signature breaks, or silent 401-as-data bugs.
3. As a **clone author**, I want no second inventiveness layer, so that I can rebrand structural UI without ripping out a fake design system.
4. As a **clone author**, I want pinned dependency versions, so that installs are reproducible.
5. As a **clone author**, I want local Docker Postgres and Hyperdrive local connection strings to agree, so that `db:up` + `dev` work without secret port folklore.
6. As a **clone author**, I want production deploy to refuse missing secrets, so that I cannot ship a half-configured Worker.
7. As a **platform maintainer**, I want “extract, don’t invent” written in ADR/CONTEXT, so that agents stop greenfielding platform code.
8. As a **platform maintainer**, I want shippable comments free of private monorepo paths, so that the open template does not imply private affiliation.
9. As a **platform maintainer**, I want static checks for raw SQL, server-fn method contracts, and client-bundle boundaries in the default `check` script, so that CI catches regressions the mature platform already guards.
10. As a **signed-out visitor**, I want public pages under locale URL prefixes, so that English and German pages are addressable and shareable.
11. As a **signed-out visitor**, I want a locale switcher that preserves path, query, and hash via real links, so that OAuth and deep links do not drop state and crawlers see both locales.
12. As a **signed-out visitor**, I want Accept-Language and an explicit locale cookie to cooperate with URL strategy without redirect loops, so that first visits feel sensible.
13. As a **user**, I want every Starter chrome string localized, so that dashboard and admin are not English-only islands.
14. As a **user**, I want dashboard and admin URLs themselves locale-prefixed (e.g. `/de/dashboard`), so that full-app i18n is addressable and shareable, not message-only.
15. As a **user**, I want my `user.locale` honored for signed-in routing and email, so that preference survives sessions.
16. As a **user**, I want sign-in and sign-up to offer email/password plus GitHub and passkey when configured, so that platform claims match the UI.
17. As a **user**, I want Turnstile on the captcha allowlist paths when captcha is enabled, so that production captcha never locks me out for missing client tokens.
18. As a **user**, I want forgot-password, reset-password, and 2FA challenge pages to work end-to-end with localized copy, so that recovery is complete.
19. As a **user**, I want pending 2FA after password or social first factor, so that second factor is enforced before a session exists.
20. As a **user**, I want passkey sign-in to satisfy second factor, so that convenience login stays secure.
21. As a **user**, I want account overview to show identity, verification, 2FA, passkeys, and linked GitHub status, so that I understand my security posture.
22. As a **user**, I want account security actions (password via email OTP, 2FA, passkeys, sessions, link/unlink GitHub) behind the same hardened rules as the mature platform, so that re-auth and eviction behave correctly.
23. As a **user**, I want client-side auth refusals to surface as failed queries with HTTP status semantics, so that UIs show “sign in again” instead of caching a 401 as data.
24. As an **OAuth client developer**, I want discovery and protected-resource metadata to describe real issuer and audience values, so that automated clients can configure themselves.
25. As an **OAuth client developer**, I want multi-value OAuth query parameters to survive router search round-trips, so that consent and sign-in do not fail with invalid_signature.
26. As an **OAuth client developer**, I want the consent page to forward the signed OAuth query intact, so that authorization completes.
27. As an **administrator**, I want OAuth Apps management for registered clients, so that I control who can use the issuer.
28. As an **administrator**, I want Users, Audit Log, and peer protection, so that admins cannot demote or ban each other.
29. As an **administrator**, I want payment method toggles enforced server-side, so that disabled rails cannot take money.
30. As a **payment integrator**, I want Stripe/Creem/NowPayments webhooks verified and mapped to Purchase fulfillment, so that paid events are idempotent.
31. As a **product developer**, I want a single purchase-paid hook, so that my domain fulfills entitlements without a wallet in the Starter.
32. As a **Worker operator**, I want baseline security headers on responses, so that default hardening is present.
33. As a **Worker operator**, I want personalized SSR not stored in the shared Workers cache keyed only by URL, so that one user’s cookies never poison another’s HTML.
34. As a **Worker operator**, I want auth HTTP rate limiting, so that credential stuffing is not left to per-isolate memory alone.
35. As a **Worker operator**, I want production configuration validated before serving, so that missing env fails closed with a generic 500.
36. As a **developer**, I want composed Base UI Field/Select/Dialog/Checkbox/Tabs with correct data attributes, so that forms and account tabs look and behave correctly.
37. As a **developer**, I want structural shells for auth, dashboard, and admin without a brand skin, so that flows are navigable and rebrandable.
38. As a **developer**, I want dead UI modules and unused dependencies removed, so that the tree matches what ships.
39. As a **developer**, I want one token/utility path for chrome colors, so that pages do not mix invented semantic tokens with raw neutral utility classes.
40. As a **developer**, I want API and well-known routes free of locale prefixes, so that clients and discovery stay stable.
41. As a **developer**, I want client-bundle checks to fail if server-only symbols leak into the browser build, so that `node:async_hooks` class bugs cannot ship.
42. As a **developer**, I want server functions that mutate to refuse GET-by-default drift, so that CSRF and method contracts hold.
43. As a **developer**, I want raw SQL usage gated by a check script, so that RLS GUC self-escalation patterns are hard to reintroduce.
44. As a **developer**, I want TypeScript path aliases (`@/*` and `#/*`) consistent with package imports, so that tooling agrees with the bundler.
45. As a **developer**, I want Better Auth core and official plugins on aligned versions, so that adapters do not drift.
46. As a **developer**, I want OAuth access-token TTL constants to match issuer configuration, so that future revocation/not-before logic is not wrong by default.
47. As a **developer**, I want `user.update` to refuse privileged fields and re-apply display-name rules, so that clients cannot write role or revocation columns.
48. As a **developer**, I want optional Sentry left as an explicit later adoption, so that observability is not half-wired product telemetry.
49. As a **documentation reader**, I want CONTEXT terms for extraction fidelity, request pipeline, and full-app URL i18n, so that specs use shared language.
50. As a **documentation reader**, I want ADRs to record URL pattern strategy, pipeline contracts, and hygiene scripts, so that inventiveness is non-compliant by policy.
51. As a **security reviewer**, I want disabled Better Auth plugin HTTP paths preserved, so that plugin admin/OTP routes cannot bypass Starter guards.
52. As a **security reviewer**, I want session cookie-cache bounds documented and privileged mutations re-reading the database, so that revocation semantics stay honest.
53. As a **QA engineer**, I want tests at pipeline and auth seams (not implementation snapshots of class strings), so that refactors can delete inventiveness without false red.
54. As a **QA engineer**, I want e2e coverage for locale switching on public and dashboard without loops, so that full-app URL i18n regressions are caught in the browser.
55. As an **open-source consumer**, I want no private product brand, production domains, or internal service names in the template, so that the repo is safe to publish.
56. As an **open-source consumer**, I want seed and docker credentials obviously local-only, so that I never mistake them for production secrets.

---

## Implementation Decisions

### A. Extraction fidelity (policy)

1. **Source of structural truth** for platform capabilities is the mature private reference platform’s web app. Open docs never name that product, its domains, monorepo paths, or internal services.
2. **Allowed deltas** from the reference: strip product domain; replace brand strings with env-driven site identity; locale set `en`/`de`; standalone package layout (not monorepo); omit optional observability until deliberately adopted; omit product-only crons, containers, AI bindings, and product SEO.
3. **Disallowed deltas**: greenfield design systems; alternate control APIs for the same Base UI primitives; alternate locale switcher behavior; omitting load-bearing pipeline contracts “to keep the starter small”; inventing parallel helpers when a reference helper already exists.
4. When a bug appears, **prefer deleting inventiveness and re-copying the reference pattern** over adding Starter-only special cases.

### B. Request pipeline

5. **Start instance** registers: CSRF middleware for server functions; **HttpError serialization adapter** so `status` and `error` survive the server-fn wire. Adapter key uses a generic starter id, never a private product id.
6. **Query client** treats HttpError 4xx as non-retryable; global 401 handling sends the browser to sign-in (existing auth redirect helper pattern from the reference, de-branded).
7. **Worker/server entry** wraps the framework handler with Paraglide middleware and always passes the **original** Request into the Start handler (never the delocalized rewrite request) to avoid locale 307 loops. Ambient `getLocale()` still comes from the middleware.
8. **Router** keeps `trailingSlash: "preserve"`, rewrite input/output via de-/localize URL helpers, and **custom search stringification** that re-emits multi-value keys as repeated keys (OAuth `ba_param` integrity). Parsing stays on the framework default multi-value → array behavior.
9. **Security**: baseline security headers on Worker responses; production CSP nonce application remains isomorphic and must not pull `node:async_hooks` into the client bundle (same strip/guard pattern as the reference). Personalized SSR: Workers asset/cache **disabled** or equivalent “do not cache HTML by URL alone” policy.
10. **Production fail-closed**: validate required env on Worker fetch in production; public body stays a generic 500.
11. **Optional later**: edge Accept-Language locale redirect for bare public paths only, with Vary, cookie write, and no redirect of markdown/API. Not required for the first merge if URL switcher + catalogs work; if added, must not 307-loop with rewrite.

### C. Paraglide / i18n URL strategy (amends ADR 0005)

12. **Full-app i18n is non-negotiable** for the Starter: every user-facing page (public, auth, **dashboard**, **admin**) is message-localized **and** locale-prefixed in the URL. A private reference product that has not finished full-app i18n is **not** a template model — do not copy path-neutral dashboard/admin “until later.”
13. **URL patterns** are an **explicit allowlist of all user-facing HTML trees**, not the framework default “localize every path.”
14. **Never locale-prefix**: `/api/*`, `/.well-known/*`, webhook paths, and other machine clients. Implement via a trailing identity catch-all in the shared Paraglide config.
15. **Include in the allowlist**: public, auth, `/dashboard/*`, `/admin/*` (and any other Starter HTML pages), including trailing-slash twins where the host may append `/`.
16. **OAuth / consent under locale URLs** still require search-stringify integrity and signed-query forwarding (ADR 0010 / 0002). Full-app prefixes do not waive those contracts; tests must cover locale-prefixed consent/sign-in query round-trips.
17. **Locale switcher**: Base UI menu (or equivalent) of **real localized anchors** to the same path/query/hash on public, auth, dashboard, and admin; write the locale cookie used by any edge detect. No button-only `setLocale` as the primary control.
18. Shared **Paraglide compile options** used by Vite and tests so runtime `urlPatterns` cannot drift.

### D. Auth factory and HTTP

19. Align **Better Auth core and official plugins** on the same minor line.
20. **Access token TTL**: single constant drives issuer `accessTokenExpiresIn` and any exported TTL helpers.
21. **OAuth protected-resource metadata** returns real resource/audience and authorization server identifiers derived from app origin/issuer helpers — or the route is removed until real. Empty WIP payloads are forbidden while discovery is advertised.
22. Explicit `adminRoles` / `defaultRole` on the admin plugin; no product-only roles (e.g. provider) in the Starter.
23. **user.create.before** and **user.update.before**: verified email rules on social create; refuse client writes of server-controlled fields; re-apply display-name rules on update.
24. **Auth rate limit** middleware on the auth catch-all route + Worker rate-limit binding pattern from the reference (generic names).
25. Keep **disabled auth paths** list; keep peer protection and account-security server functions.

### E. Auth and security pages

26. Sign-in / sign-up must wire: email/password, Turnstile when captcha enabled, GitHub when configured, passkey when appropriate, already-signed-in redirect, OAuth resume helpers that preserve signed query.
27. Forgot/reset/2FA/consent use the same composed Field/Button patterns and localized messages (no English-only literals for primary chrome).
28. Account page uses composed controls; Tabs active state follows Base UI (`data-active`, not Select’s selected attribute).

### F. UI shell (amends ADR 0007)

29. Interactive controls are **composed Base UI wrappers** with a small structural class vocabulary (layout, border, focus ring). Not a shadcn-like semantic token product (`primary`/`muted` design language as a second system).
30. Prefer one **Auth shell** and one **App shell** (dashboard/admin nav variants) over a grab-bag of PageAlert/Surface dual export surfaces — unless those helpers map 1:1 to reference components.
31. **Delete** unused control modules, unused integration widgets, and dependencies with zero call sites (form/table/font/icon packages only stay if wired).
32. Theme control may be a minimal light/dark (optional system) control for FOUC-safe class on `html`; it must not reintroduce a product marketing widget. No requirement to port decorative animation toggles.
33. Do not ship enter/exit dialog motion if the reference deliberately removed it for cost/a11y consistency — match the calmer default.

### G. Data, payments, RLS

34. Keep platform tables: auth schema, system config, admin action audit, purchase. No product ledger/wallet tables.
35. Drop or justify leftover columns that imply unmounted plugins (e.g. Stripe customer id without Stripe auth plugin).
36. Purchase-paid hook and optional payment adapters remain; demo checkout stays optional and env-gated.
37. Local Docker role name stays generic (`starter_app` or equivalent); never copy production role passwords from a private product.

### H. Tooling and hygiene

38. Pin TanStack and related packages to concrete versions (match the reference generation when practical).
39. Default `check` runs formatter/linter **and** server-fn contract check **and** sql-raw check **and** (post-build) client-bundle check with markers including server-fn leakage.
40. Deploy path: production mode build, validate required production env, deploy with secrets file or equivalent; document `secrets.required` when wrangler supports the contract.
41. Align Hyperdrive `localConnectionString` port with Docker Compose published port and `.env.example`.
42. Gitignore production env files (e.g. `.env.prod`).
43. TypeScript paths include both `@/*` and `#/*` if both import styles are used.
44. Biome respects VCS/gitignore like a serious template.
45. Refresh Worker env typings to cover secrets the app actually reads.

### I. Privacy

46. Remove private product names and monorepo paths from shippable comments and config remarks.
47. Docs remain free of private operational detail; describe patterns generically (“mature reference platform”, “extraction source”).

### J. Phased delivery (suggested merge order)

**Phase 0 — Stop the bleeding (pipeline + config)** — **landed 2026-08-02**  
HttpError adapter + query handling; search stringify; Paraglide allowlist config; local DB port; OAuth TTL; scrub private comments; pin critical deps.

**Phase 1 — Auth capability parity** — **landed 2026-08-02**  
Rate limit; protected-resource metadata; user update guard; sign-in/up Turnstile/GitHub/passkey; redirect-if-authenticated; message coverage for auth routes.

**Phase 2 — UI extraction** — **landed 2026-08-02**  
Replace invented token/class system with composed Base UI + structural shell; fix Tabs; locale switcher links; delete dead code/deps; remove neutral-* dual palette.

**Phase 3 — Hygiene** — **landed 2026-08-02**  
check scripts; validate-prod-env; security headers/CSP/cache-off; worker types; broader tests.

Phases may land as stacked PRs; Phase 0 is not optional before calling the Starter “aligned.”

---

## Testing Decisions

### What good tests look like

- Assert **external behavior and contracts**, not class-string snapshots or file existence of inventiveness.
- Prefer the **highest seam**: auth factory outcomes, HTTP status on refusals, OAuth query round-trip, purchase idempotency, RLS transaction helpers, bundle checker markers.
- Do not require the private reference repo at test time; encode the contract in the Starter.

### Modules / contracts to test

| Area | Examples of behavior |
|---|---|
| HttpError wire | Thrown HttpError from a server function preserves status on the client rejection |
| Search params | Multi-value keys stringify as repeated keys, not JSON arrays |
| URL patterns | API and well-known stay unprefixed; public, auth, dashboard, and admin have locale forms (e.g. `/de/dashboard`) |
| Auth paths | Disabled plugin routes still 404 at HTTP |
| Captcha | When enabled, allowlisted paths require captcha header semantics (existing harness style) |
| Peer protection | Admin cannot demote peer admin |
| Purchase | Paid once under duplicate webhooks |
| RLS | Service vs user scope helpers |
| Client bundle | Fails if forbidden server markers appear in client output |
| Server-fn contract | Mutating fns are not GET-default |
| Locale switcher (e2e) | Switching locale does not infinite-redirect; content and URL language change on public **and** dashboard/admin |

### Prior art in this repo

- Account security, admin peer protection, auth-paths, body-limit, payments-verify, purchase-fulfillment, RLS helpers/policy, input-rules, auth harness + testcontainers global setup.
- Playwright e2e for theme/chrome may remain; extend for locale smoke rather than replacing unit seams.

### Tests deliberately not copied

Product-domain suites (gateway, wallet, referral, tokenizer, containers) stay out.

---

## Out of Scope

- Reintroducing any product domain (wallets, gateways, referral, marketplace providers, API-key product, withdrawals, model routing, product crons, containers, tokenizer services).
- Copying private brand identity, production domains, production secrets, or monorepo package names into the open template.
- Adopting Sentry or full CSP product allowlists as mandatory if not yet chosen — patterns may be stubbed; full observability productization is optional follow-up.
- Changing the in-tree locale pair away from `en`/`de`.
- Building a new design system, marketing homepage, or animated brand theme toggle.
- Multi-email transports, SQLite/D1, subscription billing product, env-based auto Superadmin.
- Perfect visual parity with the private reference’s marketing chrome.

---

## Further Notes

- The living baseline spec (`2026-08-01-platform-capabilities.md`) remains the capability catalog; **this spec is the alignment remediation** when implementation diverged from extraction.
- “Smaller starter” is not an excuse to drop load-bearing contracts; size reduction must come from **deleting inventiveness and product domain**, not from deleting wire integrity.
- When in doubt, open the reference module and port structure; do not redesign from memory.
- Human review gate: this draft is for maintainer inspection before agent implementation (`ready-for-agent` only after approval).

---

## Definition of done (this remediation)

- [x] Phase 0 pipeline contracts landed and tested
- [x] Auth UI parity with configured server plugins
- [x] Invented design-system files removed or replaced by composed Base UI + structural shell
- [x] Paraglide allowlist + identity catch-all active; locale switcher is link-based
- [x] Hygiene scripts in `check`; prod env validation on deploy path
- [x] No private product names/paths in shippable tree
- [ ] CONTEXT + ADRs updated and consistent with behavior *(docs already approved; no rewrite required by implementation)*
- [ ] Capability baseline spec status note points at this remediation
- [ ] Maintainer sign-off on this draft
