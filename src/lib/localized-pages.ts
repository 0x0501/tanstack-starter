/**
 * Every Starter user-facing HTML path that receives a locale URL form.
 *
 * Machine paths (`/api/*`, `/.well-known/*`, webhooks) are intentionally
 * omitted — the Paraglide identity catch-all leaves them unprefixed.
 *
 * Keep this list in sync with real routes under `src/routes/`. Nested
 * dashboard/admin pages must appear here (or as a tree pattern in
 * `paraglide.config.ts`) for full-app URL i18n.
 */
export const LOCALIZED_PAGES = [
	"/",
	"/sign-in",
	"/sign-up",
	"/forgot-password",
	"/reset-password",
	"/two-factor",
	"/oauth/consent",
	"/dashboard",
	"/dashboard/account",
	"/admin",
	"/admin/users",
	"/admin/audit",
	"/admin/oauth-apps",
] as const;

export type LocalizedPage = (typeof LOCALIZED_PAGES)[number];
