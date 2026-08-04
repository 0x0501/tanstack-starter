import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Database } from "@/db";
import {
	handleNowPaymentsWebhook,
	verifyNowPaymentsSignature,
} from "@/services/nowpayments";

/** A db that fails the test if the handler touches it. */
const unusableDb = new Proxy({} as Database, {
	get() {
		throw new Error("handler reached the database on an unverified callback");
	},
});

function sign(secret: string, canonical: string): string {
	return createHmac("sha512", secret).update(canonical).digest("hex");
}

describe("verifyNowPaymentsSignature", () => {
	it("accepts HMAC-SHA512 over recursively sorted JSON keys", async () => {
		const body = JSON.stringify({ payment_status: "finished", b: 1, a: 2 });
		const canonical = JSON.stringify({
			a: 2,
			b: 1,
			payment_status: "finished",
		});
		expect(
			await verifyNowPaymentsSignature(
				"ipn_sec",
				body,
				sign("ipn_sec", canonical),
			),
		).toBe(true);
	});

	it("sorts nested objects but keeps array order", async () => {
		const body = JSON.stringify({ z: { b: 1, a: [2, 1] }, y: 0 });
		const canonical = JSON.stringify({ y: 0, z: { a: [2, 1], b: 1 } });
		expect(
			await verifyNowPaymentsSignature(
				"ipn_sec",
				body,
				sign("ipn_sec", canonical),
			),
		).toBe(true);
	});

	it("rejects a missing or wrong signature", async () => {
		const body = '{"payment_status":"finished"}';
		expect(await verifyNowPaymentsSignature("ipn_sec", body, null)).toBe(false);
		expect(await verifyNowPaymentsSignature("ipn_sec", body, "deadbeef")).toBe(
			false,
		);
	});

	// A refusal, not a crash: a 500 here would tell NowPayments to retry, and a
	// hostile body would be replayed forever.
	it("refuses an unparseable body instead of throwing", async () => {
		expect(await verifyNowPaymentsSignature("ipn_sec", "{not json", "aa")).toBe(
			false,
		);
	});

	it("refuses a body nested past the depth limit instead of exhausting the stack", async () => {
		let deep = "1";
		for (let i = 0; i < 200; i++) deep = `{"a":${deep}}`;
		expect(await verifyNowPaymentsSignature("ipn_sec", deep, "aa")).toBe(false);
	});
});

describe("handleNowPaymentsWebhook", () => {
	it("refuses an unverified callback without touching the database", async () => {
		const result = await handleNowPaymentsWebhook(unusableDb, {
			rawBody: '{"order_id":"o1","payment_status":"finished"}',
			signature: "deadbeef",
			ipnKey: "ipn_sec",
		});
		expect(result).toBe("invalid_signature");
	});

	it("leaves a non-terminal status alone", async () => {
		const body = JSON.stringify({ order_id: "o1", payment_status: "waiting" });
		const result = await handleNowPaymentsWebhook(unusableDb, {
			rawBody: body,
			signature: sign("ipn_sec", body),
			ipnKey: "ipn_sec",
		});
		expect(result).toBe("noop");
	});

	it("does not fulfill an underpaid invoice", async () => {
		const body = JSON.stringify({
			actually_paid: 9,
			order_id: "o1",
			payment_status: "finished",
			price_amount: 10,
		});
		const result = await handleNowPaymentsWebhook(unusableDb, {
			rawBody: body,
			signature: sign("ipn_sec", body),
			ipnKey: "ipn_sec",
		});
		expect(result).toBe("underpaid");
	});
});
