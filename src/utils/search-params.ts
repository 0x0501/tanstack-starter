/**
 * Search-param serialization that keeps multi-value keys as repeated keys.
 *
 * TanStack Router's default `stringifySearch` JSON-encodes arrays, so a Better
 * Auth signed OAuth query like `ba_param=a&ba_param=b` becomes
 * `ba_param=["a","b"]`. The oauth-provider client then rebuilds `oauth_query`
 * from `window.location.search`, drops every real signed field (it only keeps
 * keys listed in `ba_param`), and sign-in/consent fail with `invalid_signature`.
 *
 * Parsing stays on the default (multi-value → array). Only stringification
 * changes: primitive arrays expand back to repeated keys.
 */

/** Values TanStack's default parse can produce for a single search key. */
export type SearchParamValue =
	| string
	| number
	| boolean
	| null
	| undefined
	| SearchParamValue[]
	| { readonly [key: string]: SearchParamValue };

export type SearchParamsRecord = Record<string, SearchParamValue>;

export function stringifySearch(search: SearchParamsRecord): string {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(search)) {
		if (value === undefined) continue;
		appendSearchValue(params, key, value);
	}
	const encoded = params.toString();
	return encoded ? `?${encoded}` : "";
}

function appendSearchValue(
	params: URLSearchParams,
	key: string,
	value: SearchParamValue,
): void {
	if (Array.isArray(value)) {
		for (const item of value) {
			if (item === undefined) continue;
			// Nested objects stay JSON; primitives re-emit as repeated keys so
			// Better Auth's multi-value `ba_param` list survives a round-trip.
			if (item !== null && typeof item === "object") {
				params.append(key, JSON.stringify(item));
			} else {
				params.append(key, String(item));
			}
		}
		return;
	}
	if (value !== null && typeof value === "object") {
		params.set(key, JSON.stringify(value));
		return;
	}
	// Mirror default stringifySearchWith: strings that are valid JSON are
	// re-encoded so parse/stringify stays symmetric for quoted values.
	if (typeof value === "string") {
		try {
			JSON.parse(value);
			params.set(key, JSON.stringify(value));
			return;
		} catch {
			params.set(key, value);
			return;
		}
	}
	params.set(key, String(value));
}
