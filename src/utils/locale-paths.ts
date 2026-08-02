/**
 * Locale → path pairs for one user-facing page (English bare, German prefixed).
 * Shared by Paraglide urlPatterns so English stays bare and German is prefixed.
 */
export function localizedLocalePaths(
	page: string,
): Array<readonly [string, string]> {
	if (page === "/") {
		return [
			["en", "/"],
			["de", "/de/"],
		];
	}
	return [
		["en", page],
		["de", `/de${page}`],
	];
}
