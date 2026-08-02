# Full-app i18n via URL prefixes and user.locale

## Status

Accepted — 2026-08-01.  
Amended — 2026-08-02 (URL allowlist for *all* user-facing pages; identity catch-all for machines only).  
Amended — 2026-08-02 (clarification: Starter is full-app URL i18n; incomplete reference localization is not a template model).

## Context

Many apps localize marketing only and leave dashboard/admin English. Clones then inherit an English-only authenticated island that is hard to unwind. The Starter freezes **full-app localization** instead: every user-facing page is message-localized **and** addressable under a locale URL form.

A private reference product may still be mid-migration on i18n (partial URL coverage, cookie-heavy ambient locale). **That incomplete state is not the Starter model.** The template must not copy “dashboard stays English/path-neutral until later.”

Separately, URL strategy must still protect machine clients: prefixing `/api` or `/.well-known` breaks discovery, webhooks, and OAuth. Naïve framework default “localize every path” is wrong; so is “only public/auth are localized.”

## Decision

1. **Full-app i18n (non-negotiable):** Every Starter user-facing page is localized with Paraglide — public, auth, **user dashboard**, and **admin console**. There is no English-only authenticated island for chrome strings **or** for addressable paths.
2. **Locale is in the URL** for every user-facing HTML page (prefix strategy), including `/dashboard/*` and `/admin/*` (e.g. `/de/dashboard`, `/de/admin/users`), with trailing-slash twins where hosts may append `/`.
3. **URL patterns are an explicit allowlist of user-facing routes**, not the framework default localize-all pattern:
   - Include public, auth, dashboard, and admin route trees (and any other Starter HTML pages).
   - **Identity catch-all only for machines:** `/api/*`, `/.well-known/*`, webhooks, and other non-HTML clients **never** receive a locale prefix.
4. Signed-in users also store **`user.locale`**; signed-in routing and outbound email honor it. Anonymous visitors use URL locale and Accept-Language where edge detect exists. Cookie may assist ambient locale / edge detect; it does **not** replace URL prefixes for app shells.
5. In-tree locales: **`en`** (default) and **`de`** (second locale). Clones add or replace locales.
6. Locale switcher uses **real same-page localized links** (preserve path, query, and hash) and updates the locale cookie; button-only `setLocale` is not the primary control.
7. Server entry: Paraglide middleware sets ambient locale; the Start handler receives the **original** Request so router rewrite does not 307-loop.
8. OAuth redirects, email links, auth return paths, and consent must preserve or restore locale (URL and/or stored preference) **without** dropping signed OAuth query parameters (see ADR 0010 / OAuth search integrity). Full-app URL prefixes do not waive search-stringify or consent forwarding requirements.

## Consequences

- Message catalogs cover dashboard and admin strings, not only marketing.
- Shared Paraglide compile config lists the full user-facing route set × locales, plus identity catch-all for machines.
- Sitemap/hreflang and any `run_worker_first` rules grow with the full route set × locales.
- Do not regress to English-only app shells, path-neutral dashboard/admin, or public-only URL i18n without a new ADR.
- Do not reintroduce default localize-all (API under `/de/api/...`).
- Implementation and tests must prove locale-prefixed dashboard/admin **and** unprefixed API/well-known, plus OAuth query integrity under locale switches.
