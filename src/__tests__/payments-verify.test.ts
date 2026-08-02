import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
	verifyCreemSignature,
	verifyNowPaymentsSignature,
	verifyStripeSignature,
} from "@/services/payments-verify";

describe("verifyStripeSignature", () => {
	it("accepts a valid v1 signature", () => {
		const body = '{"id":"evt_1"}';
		const secret = "whsec_test";
		const t = Math.floor(Date.now() / 1000);
		const v1 = createHmac("sha256", secret)
			.update(`${t}.${body}`)
			.digest("hex");
		expect(verifyStripeSignature(body, `t=${t},v1=${v1}`, secret)).toBe(true);
	});

	it("rejects a bad signature", () => {
		const body = '{"id":"evt_1"}';
		expect(verifyStripeSignature(body, "t=1,v1=deadbeef", "whsec_test")).toBe(
			false,
		);
	});
});

describe("verifyCreemSignature", () => {
	it("accepts HMAC-SHA256 of the raw body", () => {
		const body = '{"id":"ch_1"}';
		const secret = "creem_sec";
		const sig = createHmac("sha256", secret).update(body).digest("hex");
		expect(verifyCreemSignature(body, sig, secret)).toBe(true);
	});
});

describe("verifyNowPaymentsSignature", () => {
	it("accepts HMAC-SHA512 over sorted JSON keys", () => {
		const body = JSON.stringify({ payment_status: "finished", b: 1, a: 2 });
		const secret = "ipn_sec";
		const sorted = JSON.stringify({ a: 2, b: 1, payment_status: "finished" });
		const sig = createHmac("sha512", secret).update(sorted).digest("hex");
		expect(verifyNowPaymentsSignature(body, sig, secret)).toBe(true);
	});
});
