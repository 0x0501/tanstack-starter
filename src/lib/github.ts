/**
 * GitHub OAuth public client id — safe to expose in the browser.
 *
 * Server and UI share this value so the button cannot appear when the issuer
 * has no provider (or vice versa). Prefer `VITE_GITHUB_CLIENT_ID` (inlined for
 * both bundles). `GITHUB_CLIENT_ID` is an optional server-only alias that must
 * match when both are set.
 */
export function githubPublicClientId(): string | undefined {
	const fromVite =
		typeof import.meta.env.VITE_GITHUB_CLIENT_ID === "string"
			? import.meta.env.VITE_GITHUB_CLIENT_ID.trim()
			: "";
	return fromVite || undefined;
}

/** True when the sign-in/up UI should offer GitHub. */
export const GITHUB_OAUTH_ENABLED = Boolean(githubPublicClientId());
