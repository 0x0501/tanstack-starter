/** Cookie written by the locale switcher so edge detect (if added) honors choice. */
export const LOCALE_COOKIE = "PARAGLIDE_LOCALE";

export function writeLocaleCookie(locale: string): void {
	if (typeof document === "undefined") return;
	const secure =
		typeof window !== "undefined" && window.location.protocol === "https:"
			? "; Secure"
			: "";
	// biome-ignore lint/suspicious/noDocumentCookie: plain sync cookie write; Cookie Store API not universal.
	document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax${secure}`;
}
