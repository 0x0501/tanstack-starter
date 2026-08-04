// @vitest-environment jsdom

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
	afterAuthTarget,
	DEFAULT_AFTER_AUTH_PATH,
	goToSignIn,
	localizedAuthPath,
	safeRedirectPath,
} from "@/utils/auth-redirect";

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

beforeEach(() => {
	window.history.replaceState({}, "", "/sign-in");
});

describe("safeRedirectPath", () => {
	it("defaults to the user dashboard when redirect is missing", () => {
		expect(safeRedirectPath(null)).toBe(DEFAULT_AFTER_AUTH_PATH);
		expect(safeRedirectPath(null)).toBe("/dashboard");
	});

	it("accepts same-origin relative paths with query and hash", () => {
		expect(safeRedirectPath("/dashboard/account?tab=security#x")).toBe(
			"/dashboard/account?tab=security#x",
		);
	});

	it("rejects open redirects and protocol-relative URLs", () => {
		expect(safeRedirectPath("//evil.example")).toBe("/dashboard");
		expect(safeRedirectPath("https://evil.example/phish")).toBe("/dashboard");
		expect(safeRedirectPath("\\evil")).toBe("/dashboard");
	});
});

describe("afterAuthTarget", () => {
	it("resumes OAuth authorize when client_id is present", () => {
		window.history.replaceState(
			{},
			"",
			"/sign-in?client_id=abc&state=1&ba_param=client_id",
		);
		expect(afterAuthTarget()).toBe(
			"/api/auth/oauth2/authorize?client_id=abc&state=1&ba_param=client_id",
		);
	});

	it("honors a safe redirect query", () => {
		window.history.replaceState(
			{},
			"",
			"/sign-in?redirect=%2Fdashboard%2Faccount",
		);
		expect(afterAuthTarget()).toBe("/dashboard/account");
	});

	it("defaults to the dashboard with no redirect", () => {
		window.history.replaceState({}, "", "/sign-in");
		expect(afterAuthTarget()).toBe("/dashboard");
	});
});

describe("localizedAuthPath + goToSignIn", () => {
	it("keeps English auth paths bare", () => {
		expect(localizedAuthPath("/sign-in")).toBe("/sign-in");
		expect(localizedAuthPath("/two-factor")).toBe("/two-factor");
	});

	it("prefixes German auth paths", async () => {
		const { overwriteGetLocale } = await import("@/paraglide/runtime");
		overwriteGetLocale(() => "de");
		try {
			expect(localizedAuthPath("/sign-in")).toBe("/de/sign-in");
			expect(localizedAuthPath("/two-factor")).toBe("/de/two-factor");
		} finally {
			overwriteGetLocale(() => "en");
		}
	});

	it("sends expired sessions to the locale-aware sign-in URL", async () => {
		const { overwriteGetLocale } = await import("@/paraglide/runtime");
		overwriteGetLocale(() => "de");
		const hrefs: string[] = [];
		const original = window.location;
		Object.defineProperty(window, "location", {
			configurable: true,
			value: {
				...original,
				get href() {
					return hrefs[hrefs.length - 1] ?? original.href;
				},
				set href(v: string) {
					hrefs.push(v);
				},
			},
		});
		try {
			goToSignIn("/de/dashboard/account?tab=security");
			expect(hrefs.at(-1)).toBe(
				`/de/sign-in?redirect=${encodeURIComponent("/de/dashboard/account?tab=security")}`,
			);
		} finally {
			Object.defineProperty(window, "location", {
				configurable: true,
				value: original,
			});
			overwriteGetLocale(() => "en");
		}
	});
});
