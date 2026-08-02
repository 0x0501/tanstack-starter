/**
 * Auth factory seam: pins the disabled-path list and captcha endpoints that
 * createAuth must wire. Measured against expected platform surface (no api-key
 * plugin in the Starter — that surface is omitted entirely).
 */
import { describe, expect, it } from "vitest";
import { CAPTCHA_ENDPOINTS, DISABLED_AUTH_PATHS } from "@/lib/auth-paths";

describe("captcha coverage", () => {
	it("gates every mounted password path and no phantom ones", () => {
		expect(CAPTCHA_ENDPOINTS).toContain("/sign-in/email");
		expect(CAPTCHA_ENDPOINTS).not.toContain("/sign-in/username");
		expect(CAPTCHA_ENDPOINTS).toContain("/sign-up/email");
		expect(CAPTCHA_ENDPOINTS).toContain("/request-password-reset");
	});
});

describe("the disabled-path list", () => {
	it("disables the jwt session→token shortcut so OAuth is the only issuance path", () => {
		expect(DISABLED_AUTH_PATHS).toContain("/token");
	});

	it("disables the entire admin plugin HTTP surface", () => {
		for (const path of [
			"/admin/set-role",
			"/admin/ban-user",
			"/admin/unban-user",
			"/admin/remove-user",
			"/admin/set-user-password",
			"/admin/has-permission",
			"/admin/list-users",
			"/admin/create-user",
			"/admin/impersonate-user",
		]) {
			expect(DISABLED_AUTH_PATHS).toContain(path);
		}
	});

	it("disables password-gated 2FA management while leaving verify routes public", () => {
		for (const path of [
			"/two-factor/enable",
			"/two-factor/disable",
			"/two-factor/generate-backup-codes",
			"/two-factor/get-totp-uri",
			"/two-factor/send-otp",
			"/two-factor/verify-otp",
		]) {
			expect(DISABLED_AUTH_PATHS).toContain(path);
		}
		expect(DISABLED_AUTH_PATHS).not.toContain("/two-factor/verify-totp");
		expect(DISABLED_AUTH_PATHS).not.toContain("/two-factor/verify-backup-code");
	});

	it("disables public email-OTP sign-in and credential mutation shortcuts", () => {
		for (const path of [
			"/sign-in/email-otp",
			"/email-otp/send-verification-otp",
			"/change-password",
			"/passkey/delete-passkey",
		]) {
			expect(DISABLED_AUTH_PATHS).toContain(path);
		}
	});

	it("does not list api-key routes — the plugin is not mounted in the Starter", () => {
		for (const path of [
			"/api-key/create",
			"/api-key/delete",
			"/api-key/list",
		]) {
			expect(DISABLED_AUTH_PATHS).not.toContain(path);
		}
	});
});
