import { describe, expect, it } from "vitest";
import { authRateLimitKey } from "@/services/auth-rate-limit";

const req = (method: string, path: string, ip?: string) =>
	new Request(`https://starter.test${path}`, {
		method,
		headers: ip ? { "cf-connecting-ip": ip } : undefined,
	});

describe("authRateLimitKey", () => {
	it("keys sensitive POST endpoints by ip + path", () => {
		expect(
			authRateLimitKey(req("POST", "/api/auth/sign-in/email", "1.2.3.4")),
		).toBe("1.2.3.4:/api/auth/sign-in/email");
	});

	it("throttles every sensitive action", () => {
		for (const p of [
			"/api/auth/sign-up/email",
			"/api/auth/forget-password",
			"/api/auth/request-password-reset",
			"/api/auth/reset-password",
			"/api/auth/send-verification-email",
		]) {
			expect(authRateLimitKey(req("POST", p, "9.9.9.9"))).toBe(`9.9.9.9:${p}`);
		}
	});

	it("does not throttle GET, or non-sensitive POST paths", () => {
		expect(
			authRateLimitKey(req("GET", "/api/auth/sign-in/email", "1.2.3.4")),
		).toBeNull();
		expect(
			authRateLimitKey(req("POST", "/api/auth/get-session", "1.2.3.4")),
		).toBeNull();
	});

	it("falls back to a stable key when the edge IP header is absent", () => {
		expect(authRateLimitKey(req("POST", "/api/auth/sign-in/email"))).toBe(
			"unknown:/api/auth/sign-in/email",
		);
	});
});
