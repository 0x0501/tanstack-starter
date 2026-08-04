/**
 * Transactional email is rendered in the recipient's language, not the
 * sender's (CONTEXT.md: emails honour `user.locale`).
 *
 * The trap this pins: Paraglide messages read an *ambient* locale by default,
 * and an email is rendered inside whatever request triggered it — a webhook,
 * a cron, or another person's session. So the locale has to arrive as an
 * argument, and a test that only calls the message function would pass while
 * every real send went out in the sender's language.
 */
import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { PasswordOtpEmail } from "@/integrations/react-email/PasswordOtpEmail";
import { ResetPasswordEmail } from "@/integrations/react-email/ResetPasswordEmail";
import { VerifyEmail } from "@/integrations/react-email/VerifyEmail";
import { mailLocale } from "@/lib/email";

describe("mailLocale", () => {
	it("keeps a locale the Starter has a catalog for", () => {
		expect(mailLocale("de")).toBe("de");
		expect(mailLocale("en")).toBe("en");
	});

	// An account that never chose a language must fall back to the base locale
	// rather than to whatever the triggering request happened to be in.
	it("falls back to the base locale, never to ambient state", () => {
		expect(mailLocale(null)).toBe("en");
		expect(mailLocale(undefined)).toBe("en");
		expect(mailLocale("fr")).toBe("en");
	});
});

describe("verification email", () => {
	it("renders German for a German account", async () => {
		const html = await render(
			VerifyEmail({
				url: "https://example.test/verify",
				name: "Ada",
				brandName: "Starter",
				locale: "de",
			}),
		);
		expect(html).toContain("Bestätige deine E-Mail-Adresse");
		expect(html).toContain('lang="de"');
		expect(html).not.toContain("Confirm your email");
	});

	it("renders English for an account with no stored locale", async () => {
		const html = await render(
			VerifyEmail({
				url: "https://example.test/verify",
				brandName: "Starter",
				locale: mailLocale(null),
			}),
		);
		expect(html).toContain("Confirm your email");
	});
});

describe("password reset email", () => {
	it("renders German for a German account", async () => {
		const html = await render(
			ResetPasswordEmail({
				url: "https://example.test/reset",
				name: "Ada",
				brandName: "Starter",
				locale: "de",
			}),
		);
		expect(html).toContain("Passwort zurücksetzen");
		expect(html).not.toContain("Reset your password");
	});
});

describe("one-time code email", () => {
	it("renders German, and distinguishes reset from sign-in", async () => {
		const reset = await render(
			PasswordOtpEmail({
				otp: "123456",
				brandName: "Starter",
				purpose: "forget-password",
				locale: "de",
			}),
		);
		const signIn = await render(
			PasswordOtpEmail({
				otp: "123456",
				brandName: "Starter",
				purpose: "sign-in",
				locale: "de",
			}),
		);

		expect(reset).toContain("Zurücksetzen");
		expect(signIn).toContain("Anmeldecode");
		expect(reset).not.toBe(signIn);
	});

	it("still carries the code itself", async () => {
		const html = await render(
			PasswordOtpEmail({
				otp: "123456",
				brandName: "Starter",
				purpose: "sign-in",
				locale: "de",
			}),
		);
		expect(html).toContain("123456");
	});
});
