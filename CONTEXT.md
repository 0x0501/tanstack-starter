# TanStack Starter context

A generic SaaS starter for TanStack Start on Cloudflare Workers. New products clone this repository and add their own domain; the Starter ships **platform capabilities only**.

## Language

### Product boundary

**Starter**:
The reusable application skeleton in this repo. It ships platform capabilities only and deliberately excludes any product domain.
_Avoid_: kitchen-sink product template; shared auth package that reintroduces product domain.

**Product domain**:
Business logic unique to one product built on the Starter (wallets, marketplaces, internal tools, etc.). It lives in the derived app, never in the Starter.
_Avoid_: treating one product’s domain concepts as Starter defaults.

**Platform capability**:
A reusable concern the Starter owns end-to-end (auth, roles, Hyperdrive, email, Turnstile, payment provider adapters, standard auth pages, user overview/account, admin Users / Audit Log / OAuth Apps, Worker hard-won patterns).
_Avoid_: feature, module, plugin (unless referring to a Better Auth plugin specifically).

**Extraction fidelity**:
Platform code is obtained by stripping product domain from a mature reference platform pattern and keeping load-bearing contracts intact. Open docs never name the private reference product, its domains, monorepo paths, or internal services.
_Avoid_: greenfield redesign of auth/pipeline/UI contracts “for the starter”; inventiveness that reintroduces solved bugs; shippable comments that identify the private source.

**Reference platform (private)**:
The mature production system whose platform patterns the Starter extracts. It is not a dependency, not a package, and not mentioned by name in the open template.
_Avoid_: linking clones back to the private monorepo; treating product features of that system as Starter defaults.

**Inventiveness**:
Starter-only redesign of a platform concern that already has a proven pattern (second design system, alternate error bus, button-only locale switcher, dropping HttpError wire serialization, default localize-all URLs). Inventiveness is a defect relative to extraction fidelity.
_Avoid_: “temporary” parallel helpers that become the real API.

### Identity & auth

**User**:
An authenticated account with the default member role. Accesses the user dashboard, not the admin console.
_Avoid_: member, customer, account (when the person/role is meant).

**Admin**:
An administrator role with full access to the admin console and the same operational capabilities as Superadmin.
_Avoid_: operator, staff, moderator (unless a product domain introduces them).

**Superadmin**:
A protected administrator label, not a higher-privilege role. Capability-identical to Admin; no administrator may ban, demote, or revoke credentials of an Admin or Superadmin, nor change their own role. Authority lives only on Better Auth's `user.role`; there is no separate admin membership table. First Superadmin is granted by operator-run SQL against the database (SQL editor or local psql), not by env auto-promotion or first-user-wins.
_Avoid_: root, god user, super user (as a separate permission tier); dual-write admin tables; runtime bootstrap email lists as the Starter default.

**Verified email**:
Every account has exactly one verified email used as the delivery channel for notification-dependent flows. Social sign-in fails closed if the provider does not supply a verified email.
_Avoid_: optional email; soft-verify later.

**Display name**:
The account's only human identity field — free-form text, not unique, not used to sign in. Sign-in is email or passkey only.
_Avoid_: username, handle, nickname as Starter identity fields.

**Locale preference**:
The account's stored preferred locale (`user.locale`). Signed-in routing and emails honor it; anonymous visitors use the URL locale and Accept-Language where edge detect exists. URL prefixes are the addressable form of **every** Starter user-facing page (public, auth, dashboard, admin). In-tree message locales are English (`en`) and German (`de`); clones add or replace locales as needed.
_Avoid_: cookie-only locale for the authenticated app; English-only app paths or chrome; locale-prefixing `/api` or `/.well-known`.

**Full-app URL i18n**:
Every user-facing HTML route is both message-localized and locale-prefixed in the URL (e.g. `/de/dashboard`, `/de/admin/users`). Incomplete localization in a private reference product is not a Starter exemption.
_Avoid_: public-only URL i18n; path-neutral dashboard/admin “until later”; English-only authenticated island.

**URL pattern allowlist**:
Explicit Paraglide URL patterns that locale-prefix **all** Starter user-facing HTML trees (public, auth, dashboard, admin), with an identity catch-all so machine paths (`/api/*`, `/.well-known/*`, webhooks) stay unprefixed.
_Avoid_: framework default “localize every path” (which would prefix API); omitting dashboard/admin from the allowlist.

**Locale switcher**:
Control that changes language via real same-page localized links (path, query, and hash preserved) and updates the locale cookie. Works on public, auth, dashboard, and admin. Primary control is not a button that only calls `setLocale`.
_Avoid_: client-only locale flips that drop OAuth query state; crawler-invisible switchers as the only mechanism.

**Social login**:
GitHub is the only OAuth consumer shipped in the Starter. Additional social providers are clone-time additions, not Starter defaults.
_Avoid_: Google/Apple as required Starter integrations; social-only registration without verified email rules.

**Account linking**:
A signed-in user may link GitHub explicitly. An unlinked GitHub sign-in auto-links only when GitHub's verified email equals the account's email and the local account is already verified. The last remaining sign-in method can never be unlinked.
_Avoid_: silent adoption of unverified local rows.

**Re-registration**:
Submitting sign-up for an address that already has an account. It never overwrites the password or other fields; it may re-send verification when unverified; the response wording does not reveal whether the address is verified.
_Avoid_: password refresh on re-signup; account-enumeration-friendly distinct errors.

**Pending 2FA challenge**:
State after the first factor succeeds and before a session exists. No session row or session cookie — only a short-lived challenge cookie. Authenticated surfaces refuse it by construction. Applies to password and social sign-in; passkey sign-in is exempt.
_Avoid_: 2FA session; half-authenticated session.

**Two-factor**:
Authenticator-app TOTP plus one-time backup codes, opt-in per user. Enabling is confirmed by emailed one-time code; disabling and backup-code rotation are confirmed by the factor itself. Management is never password-gated alone.
_Avoid_: password-only 2FA management; OTP-as-second-factor over email as the Starter default second factor.

**Passkey**:
A sign-in convenience an already-authenticated user enables; it is never a registration path. Passkey sign-in inherently satisfies the second factor.
_Avoid_: passkey as sign-up.

**Session eviction on credential change**:
Any change to a credential or second factor signs the account out everywhere except the browser that made the change (account recovery via reset link evicts all). Callers already evicted are refused from the database, not the cookie cache alone.
_Avoid_: "global sign-out only on password change"; keep-other-sessions opt-out.

**Revocation staleness**:
Sessions may be served from a signed cookie cache for a short bound (e.g. 60s). Revocation, sign-out, and ban take effect within that bound on cached surfaces; privileged mutations that must not trust the cache re-read the database.
_Avoid_: describing cookie-cache revocation as instantaneous; treating cache as a security boundary against a stolen cookie.

**Fresh-session re-auth**:
Adding or removing a passkey, and unlinking an account, require a session younger than a configured bound (e.g. 24h). A stale session re-proves identity with the factor the account has (TOTP/backup when 2FA is on, emailed OTP otherwise — never password alone for passwordless users) and is replaced by a fresh session.
_Avoid_: password-only re-auth; relying on Better Auth freshness for passkey delete without an app gate.

**Disabled auth path**:
A Better Auth HTTP route deliberately 404'd at the router because the plugin's own checks bypass Starter guards. Server-side `auth.api.*` still reaches the endpoint for use from server functions.
_Avoid_: leaving plugin admin/OTP/credential routes public "because the UI doesn't call them".

**OAuth consumer (social login)**:
Sign-in where the Starter relies on an external identity provider (e.g. GitHub) to authenticate a person. The Starter does not issue tokens to that external provider.
_Avoid_: OAuth login (ambiguous); SSO (unless true multi-app SSO is meant).

**OAuth provider (issuer)**:
The Starter acting as an OAuth 2.0 / OIDC authorization server that issues tokens to registered OAuth clients. Always on in this Starter — discovery, consent, JWKS, and admin OAuth Apps are platform surface, not optional product code.
_Avoid_: "OAuth login" for this concept; social login; auth provider (vague).

**OAuth client**:
A registered consumer of the Starter's own OAuth provider. Managing clients is administrator work, not end-user personal property.
_Avoid_: app, third-party app, API client (unless the product domain defines those separately).

**Consent page**:
The interactive page where a signed-in user approves an OAuth client's requested scopes. Must forward the signed OAuth query the issuer requires.
_Avoid_: treating consent as optional chrome for the issuer.

**OAuth search integrity**:
Router search serialization that keeps multi-value keys as repeated keys so Better Auth signed OAuth parameters survive navigation. JSON-array encoding of those keys is a platform bug.
_Avoid_: default stringify that turns `ba_param=a&ba_param=b` into a JSON array.

**HttpError wire contract**:
Server-function refusals thrown as `HttpError` keep `status` and `error` across the Start serialization boundary so clients treat them as rejected queries, not cached success data.
_Avoid_: throwing bare `Error` for auth refusals; omitting the serialization adapter while middlewares still throw `HttpError`.

### Shells & UI

**User dashboard**:
Signed-in member shell under `/dashboard` (locale prefix wraps the path under full-app URL i18n): overview and account pages. Overview is a session and account-security status surface (identity, verification, 2FA, passkeys, linked GitHub) — not product metrics. Account is one page with profile (display name, locale), security (password via email OTP, 2FA, passkeys), sessions, and linked accounts (GitHub).
_Avoid_: admin backend; fake SaaS KPI widgets; separate `/security` route as the Starter default; English-only or path-neutral dashboard.

**Admin console**:
Administrator shell under `/admin` (locale prefix wraps the path under full-app URL i18n): Users, Audit Log, and OAuth Apps. Reachable by Admin and Superadmin alike.
_Avoid_: superadmin-only backend as a second product; CMS; English-only or path-neutral admin.

**Base UI control**:
An interactive control from `@base-ui/react`, exposed through **composed wrappers** (field, button, select, dialog, checkbox, tabs, menu, etc.) that follow proven platform APIs after brand removal. Starter interactive UI is Base UI; brand styling is not.
_Avoid_: HeroUI, Radix, shadcn, native top-layer dialog as the default modal pattern; unused compound re-exports; wrong state attributes (e.g. tabs `selected` vs `active`).

**Structural shell**:
Layout-only presentation (stacks, grids, max-width, nav landmarks) so auth and admin flows are navigable. Not a design system and not brand identity.
_Avoid_: theme, skin, design tokens as Starter deliverables; a substitute “neutral SaaS” semantic token product (primary/muted design language) as a second system.

**Request pipeline**:
The Start instance, Worker/server entry, router rewrite/search/trailing-slash behavior, Paraglide ambient locale, security headers, and client-bundle boundary that every HTML and server-fn request shares.
_Avoid_: simplifying away HttpError serialization, original-Request handoff, or OAuth search stringify; pulling Node built-ins into the client graph.

### Mail, captcha, i18n

**Outbound mail**:
Platform-originated email delivered only through the Cloudflare Email (`send_email`) binding in production. Templates are react-email; the From display name is a clone-time brand string from env, not a hard-coded product name.
_Avoid_: Resend/SMTP as Starter production transports; multi-provider email product.

**Turnstile gate**:
Cloudflare Turnstile on an explicit Better Auth path list (sign-up, sign-in, forgot-password, and any other paths kept in that allowlist). Dev may run with captcha disabled when no site key is configured; production expects real keys.
_Avoid_: captcha on every authenticated route; always-on captcha with no local bypass.

**Full-app i18n**:
Every user-facing page the Starter ships — public, auth, user dashboard, and admin console — is localized through Paraglide in **messages and URL**. There is no English-only authenticated island. Machine routes (`/api`, `/.well-known`, webhooks) stay unprefixed via the identity catch-all.
_Avoid_: public-only i18n; message-only dashboard/admin without URL prefixes; localize-all defaults that prefix API.

**Platform hygiene**:
Static checks and deploy gates that protect RLS, server-fn method contracts, client-bundle boundaries, and production env completeness; plus pinned platform package versions.
_Avoid_: `check` = format-only; `"latest"` for TanStack/platform packages; deploy without required secret validation.

### Data & payments

**Database**:
PostgreSQL is the only supported database. Production access is through Cloudflare Hyperdrive; migrations use a direct migration URL. SQLite and dual-adapter paths are out of the Starter.
_Avoid_: D1 as default; sqlite for "easy dev"; multi-database support.

**RLS skeleton**:
The Starter ships a minimal Postgres row-level security pattern (service vs user transaction scopes, role-gated policies) with platform tables only. Product tables and their policies are clone-time work.
_Avoid_: app-layer-only auth as the sole story; product RLS policies living in the Starter by default.

**Payment provider adapter**:
An optional integration with an external payment rail (Stripe, Creem, NowPayments) that verifies webhooks/IPN and notifies the app of a completed purchase. Optional at runtime (env + enable toggles); not a wallet and not a SaaS subscription product. Each rail owns one module holding its signature verification and its framework-agnostic handler together — the rails do not share a state machine, so they are parallel, not factored behind one interface.
_Avoid_: recharge order, wallet credit, top-up (product-domain); payment plugin as the product; a single generic webhook interface the rails plug into.

**Purchase**:
One payment attempt the Starter records for idempotency (provider, external id, amount, currency, user, status). Success is delivered only through the purchase-paid hook; the Starter never invents balances or entitlements from it.
_Avoid_: order (unless the product domain defines Order); top-up; recharge; subscription.

**Purchase-paid hook**:
The single extension point the Starter calls after a Purchase is confirmed paid, exactly once. It runs inside the transaction that flips the Purchase to paid and receives that transaction, so a throw rolls the flip back and the provider's retry re-enters and delivers once. Because it shares the transaction it does database work only; fulfillment that needs IO writes a durable row in the hook and does the IO afterwards. Product domain implements fulfillment (entitlement, credit, flag).
_Avoid_: wallet credit handler as Starter default; product-specific settlement logic; HTTP calls or email sends inside the hook; describing delivery as "at most once" (the flip alone was that, and it lost deliveries).

**Payment method toggle**:
A superadmin/admin switch that enables or disables each payment provider adapter independently at runtime; default all on when configured. A disabled provider is refused server-side, not merely hidden from the UI.
_Avoid_: UI-only hide without server enforcement.

**Audit log**:
The admin console's append-only trail of high-risk platform events: administrator actions (ban/unban, role change, OAuth client create/delete, payment-toggle changes) and Purchase lifecycle (paid / failed / ignored duplicate). Best-effort writes; a logging failure never blocks the mutation. Not a full auth SIEM or product analytics feed.
_Avoid_: request log; every sign-in as an audit row.

## Invariants

- The Starter contains no product domain. Clones add domain tables, policies, and pages outside the platform surface.
- Platform changes follow **extraction fidelity**: strip product domain from proven patterns; do not invent parallel platform semantics.
- Shippable tree and docs do not name the private reference product, monorepo paths, or production-only internal services.
- Every account has a verified email before notification-dependent and social-link flows that assume a delivery channel.
- GitHub sign-in/sign-up fails closed without a provider-verified email.
- Re-registration never overwrites credentials; response wording does not distinguish verified vs unverified existing accounts beyond safe verification resend behavior.
- Password and social sign-in both produce a pending 2FA challenge when two-factor is enabled; passkey sign-in does not.
- Session eviction on credential/second-factor change leaves at most the acting browser's session (recovery link leaves none).
- Peer administrators cannot ban, demote, or revoke each other; no administrator changes their own role; last-admin safeguards apply where relevant.
- Better Auth plugin HTTP routes that would bypass Starter guards are disabled at the router; `auth.api.*` remains available to server functions.
- Display name is not unique and is not a sign-in identifier.
- OAuth clients are admin-managed, not end-user personal property.
- OAuth multi-value search parameters survive router round-trips; issuer metadata is never an empty WIP while advertised.
- HttpError refusals retain HTTP status across the server-function wire.
- The Start handler receives the original Request under Paraglide middleware (no de-localized handoff that 307-loops with rewrite).
- A Purchase credits fulfillment exactly once no matter how many webhooks, retries, or return-page hits arrive: never twice, and never lost to a hook that failed.
- A payment webhook answers 400 for a bad signature, 200 for every mapped outcome, and 5xx only when processing genuinely failed — the provider's retry is what makes fulfillment exactly-once.
- Fulfillment trusts the Purchase row's amount and user, never amounts reported only in a payment callback.
- Payment provider adapters that are disabled or unconfigured are refused server-side.
- Production database access is Hyperdrive → Postgres; the Better Auth Drizzle adapter is `pg` only.
- Interactive UI controls are composed Base UI wrappers; brand styling and second design systems are clone-time work, not Starter deliverables.
- User-facing pages are full-app i18n (messages + URL prefixes for public, auth, dashboard, admin; en/de in-tree); `/api` and `/.well-known` stay unprefixed; signed-in locale preference is stored on the user.
- Auth pages expose the same capabilities the server enables (Turnstile, GitHub, passkey) when those are configured — UI must not lag plugins.
- First Superadmin is created by operator SQL on `user.role`, not by open registration races.
- Platform package versions are pinned; hygiene checks guard server-fn methods, raw SQL, and client-bundle boundaries.

## Deliberate non-goals

Product-domain concepts that must not become Starter defaults include (non-exhaustive): multi-bucket wallets, ledger/recharge products, consumer API-key products, marketplace provider applications, referral/invitee rewards, gateway/routing meshes, and withdrawal flows. Clones may implement any of these outside the platform surface.
