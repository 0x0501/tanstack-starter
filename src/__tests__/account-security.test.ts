import { describe, expect, it } from "vitest";
import {
	evaluateGithubSignup,
	MONEY_REAUTH_MAX_AGE_SECONDS,
} from "@/services/account-security";

describe("evaluateGithubSignup", () => {
	it("accepts a provider-verified email", () => {
		expect(
			evaluateGithubSignup({
				email: "a@example.com",
				emailVerified: true,
			}),
		).toEqual({ ok: true });
	});

	it("fails closed without an email", () => {
		expect(evaluateGithubSignup({ email: null, emailVerified: true })).toEqual({
			ok: false,
			code: "email_not_found",
		});
	});

	it("fails closed when the provider email is unverified", () => {
		expect(
			evaluateGithubSignup({
				email: "a@example.com",
				emailVerified: false,
			}),
		).toEqual({ ok: false, code: "github_email_unverified" });
	});
});

describe("money re-auth window (docs pattern constant)", () => {
	it("is five minutes", () => {
		expect(MONEY_REAUTH_MAX_AGE_SECONDS).toBe(5 * 60);
	});
});
