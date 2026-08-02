import { beforeAll, describe, expect, it } from "vitest";
import {
	baseLocale,
	deLocalizeHref,
	locales,
	localizeHref,
} from "@/paraglide/runtime";

// Seam: Paraglide URL contract (ADR 0005 / 0010). Full-app i18n prefixes
// every user-facing HTML tree; machine paths stay identity (never locale-prefixed).
// Asserted through the *real compiled runtime* so urlPatterns regressions fail CI.

beforeAll(async () => {
	if (
		typeof (globalThis as { URLPattern?: unknown }).URLPattern === "undefined"
	) {
		const mod = (await import("@inlang/paraglide-js/urlpattern-polyfill")) as {
			URLPattern?: unknown;
			default?: unknown;
		};
		(globalThis as { URLPattern?: unknown }).URLPattern =
			mod.URLPattern ?? mod.default;
	}
});

describe("paraglide URL contract", () => {
	it("has exactly en/de with English as base", () => {
		expect([...locales].sort()).toEqual(["de", "en"]);
		expect(baseLocale).toBe("en");
	});

	it("keeps English on bare paths", () => {
		expect(localizeHref("/sign-in", { locale: "en" })).toBe("/sign-in");
		expect(localizeHref("/", { locale: "en" })).toBe("/");
		expect(localizeHref("/dashboard", { locale: "en" })).toBe("/dashboard");
		expect(localizeHref("/admin/users", { locale: "en" })).toBe(
			"/admin/users",
		);
	});

	it("prefixes German for public, auth, dashboard, and admin", () => {
		expect(localizeHref("/", { locale: "de" })).toBe("/de/");
		expect(localizeHref("/sign-in", { locale: "de" })).toBe("/de/sign-in");
		expect(localizeHref("/sign-up", { locale: "de" })).toBe("/de/sign-up");
		expect(localizeHref("/oauth/consent", { locale: "de" })).toBe(
			"/de/oauth/consent",
		);
		expect(localizeHref("/dashboard", { locale: "de" })).toBe(
			"/de/dashboard",
		);
		expect(localizeHref("/dashboard/account", { locale: "de" })).toBe(
			"/de/dashboard/account",
		);
		expect(localizeHref("/admin", { locale: "de" })).toBe("/de/admin");
		expect(localizeHref("/admin/users", { locale: "de" })).toBe(
			"/de/admin/users",
		);
		expect(localizeHref("/admin/oauth-apps", { locale: "de" })).toBe(
			"/de/admin/oauth-apps",
		);
	});

	it("never localizes machine paths", () => {
		for (const p of [
			"/api/auth/session",
			"/api/webhooks/stripe",
			"/.well-known/oauth-authorization-server",
			"/.well-known/openid-configuration",
			"/api/auth/.well-known/openid-configuration",
		]) {
			expect(localizeHref(p, { locale: "de" })).toBe(p);
			expect(localizeHref(p, { locale: "en" })).toBe(p);
		}
	});

	it("delocalizes German back to the bare path", () => {
		expect(deLocalizeHref("/de/sign-in")).toBe("/sign-in");
		expect(deLocalizeHref("/de/")).toBe("/");
		expect(deLocalizeHref("/de/dashboard")).toBe("/dashboard");
		expect(deLocalizeHref("/de/dashboard/account")).toBe(
			"/dashboard/account",
		);
		expect(deLocalizeHref("/de/admin/users")).toBe("/admin/users");
		expect(deLocalizeHref("/dashboard")).toBe("/dashboard");
	});

	it("localizes trailing-slash user-facing paths to the same-locale URL", () => {
		expect(localizeHref("/sign-in/", { locale: "de" })).toBe("/de/sign-in/");
		expect(localizeHref("/dashboard/", { locale: "de" })).toBe(
			"/de/dashboard/",
		);
		expect(localizeHref("/admin/users/", { locale: "de" })).toBe(
			"/de/admin/users/",
		);
		expect(localizeHref("/sign-in/", { locale: "en" })).toBe("/sign-in/");
	});

	it("delocalizes trailing-slash German paths back to the bare form", () => {
		expect(deLocalizeHref("/de/sign-in/")).toBe("/sign-in/");
		expect(deLocalizeHref("/de/dashboard/")).toBe("/dashboard/");
		expect(deLocalizeHref("/de/admin/users/")).toBe("/admin/users/");
	});
});
