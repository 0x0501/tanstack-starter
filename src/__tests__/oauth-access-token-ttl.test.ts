import { describe, expect, it } from "vitest";
import { ACCESS_TOKEN_TTL_SEC } from "@/lib/auth-timing";

/**
 * Seam: OAuth issuer access-token lifetime must be one constant.
 * A mismatched export vs oauthProvider.accessTokenExpiresIn silently skews
 * any future revocation / not-before logic that trusts the helper.
 */
describe("OAuth access token TTL", () => {
	it("is a positive finite duration in seconds", () => {
		expect(ACCESS_TOKEN_TTL_SEC).toBeGreaterThan(0);
		expect(Number.isFinite(ACCESS_TOKEN_TTL_SEC)).toBe(true);
	});

	// Known platform default: 6 hours (matches historical issuer config).
	it("is six hours", () => {
		expect(ACCESS_TOKEN_TTL_SEC).toBe(6 * 60 * 60);
	});
});
