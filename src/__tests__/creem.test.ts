import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Database } from "@/db";
import { handleCreemWebhook, verifyCreemSignature } from "@/services/creem";

/** A db that fails the test if the handler touches it. */
const unusableDb = new Proxy({} as Database, {
	get() {
		throw new Error("handler reached the database on an unverified event");
	},
});

function sign(secret: string, body: string): string {
	return createHmac("sha256", secret).update(body).digest("hex");
}

describe("verifyCreemSignature", () => {
	it("accepts HMAC-SHA256 of the raw body", () => {
		const body = '{"id":"ch_1"}';
		expect(
			verifyCreemSignature("creem_sec", body, sign("creem_sec", body)),
		).toBe(true);
	});

	it("rejects a bad or missing signature", () => {
		const body = '{"id":"ch_1"}';
		expect(verifyCreemSignature("creem_sec", body, "deadbeef")).toBe(false);
		expect(verifyCreemSignature("creem_sec", body, null)).toBe(false);
	});
});

describe("handleCreemWebhook", () => {
	it("refuses an unverified event without touching the database", async () => {
		const body = '{"id":"ch_1"}';
		const result = await handleCreemWebhook(unusableDb, {
			rawBody: body,
			signature: "deadbeef",
			secret: "creem_sec",
		});
		expect(result).toBe("invalid_signature");
	});

	it("refuses a signed body that is not JSON", async () => {
		const body = "{not json";
		const result = await handleCreemWebhook(unusableDb, {
			rawBody: body,
			signature: sign("creem_sec", body),
			secret: "creem_sec",
		});
		expect(result).toBe("invalid_payload");
	});

	it("ignores an event that carries no checkout id", async () => {
		const body = '{"eventType":"checkout.updated"}';
		const result = await handleCreemWebhook(unusableDb, {
			rawBody: body,
			signature: sign("creem_sec", body),
			secret: "creem_sec",
		});
		expect(result).toBe("noop");
	});
});
