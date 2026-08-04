import { describe, expect, it } from "vitest";
import de from "../../messages/de.json";
import en from "../../messages/en.json";

/**
 * Every locale catalog must carry exactly the same message keys (ADR 0005).
 *
 * A missing key ships as a silent English fallback, which reads as a finished
 * translation to everyone except the reader who speaks the other language.
 * The German *values* are reviewed by hand; this only guards the key set.
 */
const keysOf = (catalog: Record<string, unknown>) =>
	Object.keys(catalog)
		.filter((key) => key !== "$schema")
		.sort();

describe("message catalog parity", () => {
	const enKeys = keysOf(en);

	it("English defines at least one message", () => {
		expect(enKeys.length).toBeGreaterThan(0);
	});

	it("German covers exactly the same keys as English", () => {
		expect(keysOf(de)).toEqual(enKeys);
	});

	it("no catalog ships an empty string for a defined key", () => {
		for (const [locale, catalog] of [
			["en", en],
			["de", de],
		] as const) {
			for (const key of keysOf(catalog)) {
				const value = (catalog as Record<string, unknown>)[key];
				expect(
					typeof value === "string" && value.trim().length > 0,
					`${locale}.${key} is empty`,
				).toBe(true);
			}
		}
	});
});
