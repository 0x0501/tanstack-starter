import { describe, expect, it } from "vitest";
import {
	assertPasswordRules,
	InvalidFieldError,
	normalizeDisplayName,
} from "@/utils/input-rules";

describe("normalizeDisplayName", () => {
	it("accepts a normal name", () => {
		expect(normalizeDisplayName("  Ada Lovelace  ")).toBe("Ada Lovelace");
	});

	it("rejects control characters", () => {
		expect(() => normalizeDisplayName("Ada\u0000")).toThrow(InvalidFieldError);
	});

	it("rejects an empty name", () => {
		expect(() => normalizeDisplayName("   ")).toThrow(/required/i);
	});
});

describe("assertPasswordRules", () => {
	it("accepts a letter + digit + symbol password of valid length", () => {
		expect(() => assertPasswordRules("Passw0rd!")).not.toThrow();
	});

	it("rejects a password without a symbol", () => {
		expect(() => assertPasswordRules("Passw0rd")).toThrow(/symbol/i);
	});

	it("rejects a short password", () => {
		expect(() => assertPasswordRules("Ab1!")).toThrow(/at least/i);
	});
});
