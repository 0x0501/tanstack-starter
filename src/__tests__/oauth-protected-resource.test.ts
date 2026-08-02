import { describe, expect, it } from "vitest";
import { buildProtectedResourceMetadata } from "@/lib/oauth-metadata";

describe("OAuth protected resource metadata", () => {
	it("advertises the app origin as resource and the auth mount as issuer", () => {
		const meta = buildProtectedResourceMetadata({
			resource: "https://app.example.com",
			issuer: "https://app.example.com/api/auth",
		});
		expect(meta).toEqual({
			resource: "https://app.example.com",
			authorization_servers: ["https://app.example.com/api/auth"],
			scopes_supported: ["openid", "profile", "email", "offline_access"],
		});
	});

	it("never ships empty resource or authorization_servers", () => {
		const meta = buildProtectedResourceMetadata({
			resource: "https://app.example.com",
			issuer: "https://app.example.com/api/auth",
		});
		expect(meta.resource.length).toBeGreaterThan(0);
		expect(meta.authorization_servers.length).toBeGreaterThan(0);
		expect(meta.authorization_servers.every((s) => s.length > 0)).toBe(true);
	});
});
