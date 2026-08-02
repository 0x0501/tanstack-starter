import { describe, expect, it } from "vitest";
import {
	BASELINE_SECURITY_HEADERS,
	withSecurityHeaders,
} from "@/lib/security-headers";

describe("baseline security headers", () => {
	it("stamps the known header set on a response", () => {
		const res = withSecurityHeaders(new Response("ok"));
		for (const [key, value] of Object.entries(BASELINE_SECURITY_HEADERS)) {
			expect(res.headers.get(key)).toBe(value);
		}
	});

	it("preserves status and body", async () => {
		const res = withSecurityHeaders(
			new Response("payload", { status: 201, statusText: "Created" }),
		);
		expect(res.status).toBe(201);
		expect(await res.text()).toBe("payload");
	});
});
