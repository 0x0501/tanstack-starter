import { beforeAll, describe, expect, it } from "vitest";
import { samePageLocaleHref } from "@/utils/same-page-locale-href";

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

describe("samePageLocaleHref", () => {
	it("localizes the path and preserves query + hash", () => {
		expect(
			samePageLocaleHref({
				pathname: "/dashboard/account",
				search: "?tab=security",
				hash: "#sessions",
				locale: "de",
			}),
		).toBe("/de/dashboard/account?tab=security#sessions");
	});

	it("keeps English on bare paths", () => {
		expect(
			samePageLocaleHref({
				pathname: "/sign-in",
				search: "?client_id=abc",
				locale: "en",
			}),
		).toBe("/sign-in?client_id=abc");
	});

	it("delocalizes before re-localizing so switching de→en drops the prefix", () => {
		expect(
			samePageLocaleHref({
				pathname: "/de/admin/users",
				locale: "en",
			}),
		).toBe("/admin/users");
	});
});
