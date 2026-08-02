/**
 * Post-authentication navigation, shared by the sign-in page, the two-factor
 * page, and the social/passkey buttons. Client-only (reads window).
 */
import { localizeHref } from "@/paraglide/runtime";

/** Default landing after a successful sign-in when no ?redirect= is present. */
export const DEFAULT_AFTER_AUTH_PATH = "/dashboard";

/**
 * Locale-prefix a Starter auth HTML path for the active locale.
 * Machine paths (`/api/*`) must not go through this helper.
 */
export function localizedAuthPath(
	path: "/sign-in" | "/sign-up" | "/two-factor" | "/forgot-password",
): string {
	return localizeHref(path);
}

export function safeRedirectPath(value: string | null): string {
	if (!value) return DEFAULT_AFTER_AUTH_PATH;
	if (!value.startsWith("/") || value.startsWith("//")) {
		return DEFAULT_AFTER_AUTH_PATH;
	}
	if (value.includes("\\")) return DEFAULT_AFTER_AUTH_PATH;
	if ([...value].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) {
		return DEFAULT_AFTER_AUTH_PATH;
	}
	try {
		const url = new URL(value, window.location.origin);
		return url.origin === window.location.origin
			? `${url.pathname}${url.search}${url.hash}`
			: DEFAULT_AFTER_AUTH_PATH;
	} catch {
		return DEFAULT_AFTER_AUTH_PATH;
	}
}

/**
 * Send a user whose session died back to sign-in, carrying where they were so
 * they land back on it. A full navigation rather than a router one: the session
 * is gone, so every cached query behind it is stale too.
 *
 * Path is locale-prefixed so full-app URL i18n is preserved (e.g. `/de/sign-in`).
 */
export function goToSignIn(from: string): void {
	const signIn = localizedAuthPath("/sign-in");
	window.location.href = `${signIn}?redirect=${encodeURIComponent(from)}`;
}

/**
 * Where to land after a completed authentication: resume an OAuth authorize
 * flow if we arrived mid-authorize (a client_id in the signed query the login
 * page carries), otherwise honor ?redirect or the user dashboard.
 */
export function afterAuthTarget(): string {
	const query = window.location.search.replace(/^\?/, "");
	const params = new URLSearchParams(query);
	if (params.has("client_id")) return `/api/auth/oauth2/authorize?${query}`;
	return safeRedirectPath(params.get("redirect"));
}
