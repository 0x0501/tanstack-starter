import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Database } from "@/db";
import { handleStripeWebhook, verifyStripeSignature } from "@/services/stripe";

/** A db that fails the test if the handler touches it. */
const unusableDb = new Proxy({} as Database, {
	get() {
		throw new Error("handler reached the database on an unverified event");
	},
});

function signedHeader(secret: string, body: string, at = Date.now() / 1000) {
	const t = Math.floor(at);
	const v1 = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
	return `t=${t},v1=${v1}`;
}

describe("verifyStripeSignature", () => {
	it("accepts a valid v1 signature", () => {
		const body = '{"id":"evt_1"}';
		expect(
			verifyStripeSignature(
				"whsec_test",
				body,
				signedHeader("whsec_test", body),
			),
		).toBe(true);
	});

	it("rejects a bad or missing signature", () => {
		const body = '{"id":"evt_1"}';
		expect(verifyStripeSignature("whsec_test", body, "t=1,v1=deadbeef")).toBe(
			false,
		);
		expect(verifyStripeSignature("whsec_test", body, null)).toBe(false);
		expect(verifyStripeSignature("whsec_test", body, "garbage")).toBe(false);
	});

	it("rejects a replayed signature outside the tolerance window", () => {
		const body = '{"id":"evt_1"}';
		const old = Date.now() / 1000 - 3600;
		expect(
			verifyStripeSignature(
				"whsec_test",
				body,
				signedHeader("whsec_test", body, old),
			),
		).toBe(false);
	});
});

describe("handleStripeWebhook", () => {
	it("refuses an unverified event without touching the database", async () => {
		const body = '{"type":"checkout.session.completed"}';
		const result = await handleStripeWebhook(unusableDb, {
			rawBody: body,
			signature: "t=1,v1=deadbeef",
			secret: "whsec_test",
		});
		expect(result).toBe("invalid_signature");
	});

	it("ignores every event type other than a completed checkout", async () => {
		const body =
			'{"type":"payment_intent.created","data":{"object":{"id":"pi_1"}}}';
		const result = await handleStripeWebhook(unusableDb, {
			rawBody: body,
			signature: signedHeader("whsec_test", body),
			secret: "whsec_test",
		});
		expect(result).toBe("noop");
	});

	it("refuses a signed body that is not JSON", async () => {
		const body = "{not json";
		const result = await handleStripeWebhook(unusableDb, {
			rawBody: body,
			signature: signedHeader("whsec_test", body),
			secret: "whsec_test",
		});
		expect(result).toBe("invalid_payload");
	});
});
