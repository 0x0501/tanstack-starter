import { LOCALIZED_PAGES } from "./src/lib/localized-pages";
import { localizedLocalePaths } from "./src/utils/locale-paths";

// Shared Paraglide compiler options (ADR 0005 / 0010). Imported by the Vite
// plugin (dev/build) AND scripts/compile-paraglide.ts so Vitest compiles an
// identical runtime — `urlPatterns` can only be passed through the JS compile
// API, never the CLI, so it must live in one place both entry points read.

type UrlPattern = { pattern: string; localized: Array<[string, string]> };

// Allowlist localization: every user-facing HTML tree gets a locale form.
// English stays on its bare path; German gets a path prefix. The trailing
// identity catch-all keeps machine paths (/api, /.well-known, webhooks, …)
// locale-neutral — never default “localize every path”.
//
// Non-home pages also register a trailing-slash twin so `/de/sign-in/` does
// not fall through the identity catch-all. Home stays `/` and `/de/` only.
const localizedPagePatterns: UrlPattern[] = LOCALIZED_PAGES.flatMap((page) => {
	const localized = localizedLocalePaths(page).map(
		([locale, path]) => [locale, path] as [string, string],
	);
	const patterns: UrlPattern[] = [{ pattern: page, localized }];
	if (page !== "/") {
		const withSlash = `${page}/`;
		patterns.push({
			pattern: withSlash,
			localized: localized.map(([locale, path]) => [
				locale,
				path.endsWith("/") ? path : `${path}/`,
			]),
		});
	}
	return patterns;
});

const identityCatchAll: UrlPattern = {
	pattern: "/:path(.*)?",
	localized: [
		["en", "/:path(.*)?"],
		["de", "/:path(.*)?"],
	],
};

export const paraglideOptions = {
	project: "./project.inlang",
	outdir: "./src/paraglide",
	strategy: ["url", "baseLocale"] as ("url" | "baseLocale")[],
	urlPatterns: [...localizedPagePatterns, identityCatchAll],
};
