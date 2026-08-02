/**
 * Site identity helpers for document head (title, OG, JSON-LD).
 * Clone-time: set VITE_APP_TITLE / VITE_APP_ORIGIN (and server APP_ORIGIN).
 */

const trimSlash = (value: string) => value.replace(/\/+$/, "");

function readOrigin(): string {
	// Prefer public Vite env (available on client + build).
	const viteOrigin = import.meta.env.VITE_APP_ORIGIN as string | undefined;
	if (viteOrigin?.trim()) return trimSlash(viteOrigin.trim());

	// Server-only: APP_ORIGIN from process (Workers / Node).
	if (typeof process !== "undefined") {
		const appOrigin = process.env.APP_ORIGIN?.trim();
		if (appOrigin) return trimSlash(appOrigin);
	}

	// Browser fallback when env is not injected (local preview).
	if (typeof window !== "undefined" && window.location?.origin) {
		return trimSlash(window.location.origin);
	}

	return "";
}

/** Display name for <title>, PWA, and schema.org. */
export const SITE_NAME =
	(import.meta.env.VITE_APP_TITLE as string | undefined)?.trim() ||
	"TanStack Starter";

/**
 * Absolute origin used for OG/JSON-LD URLs.
 * Empty when unknown — structured data is then omitted.
 */
export const SITE_ORIGIN: string = readOrigin();

/** Resolve a site-relative path to an absolute URL when origin is known. */
export function abs(path: string): string {
	const p = path.startsWith("/") ? path : `/${path}`;
	return SITE_ORIGIN ? `${SITE_ORIGIN}${p}` : p;
}

export const DEFAULT_TITLE = `${SITE_NAME} — Platform SaaS starter`;
export const DEFAULT_DESCRIPTION =
	"Generic SaaS platform shell: auth, roles, Postgres Hyperdrive, email, Turnstile, optional payments, user dashboard, and admin console — no product domain. Clone and brand it.";

/** Browser chrome tint — keep in sync with styles.css tokens. */
export const THEME_COLOR_LIGHT = "#ffffff";
export const THEME_COLOR_DARK = "#0a0a0a";

/** Head meta for auth / dashboard / admin — never index transactional surfaces. */
export const NOINDEX_META = [
	{ name: "robots", content: "noindex, nofollow" },
] as const;

export function pageTitle(title: string): string {
	return `${title} · ${SITE_NAME}`;
}
