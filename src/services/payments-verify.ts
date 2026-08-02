/**
 * Signature verification helpers for payment webhooks (no product logic).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyStripeSignature(
	rawBody: string,
	signatureHeader: string | null,
	secret: string,
	toleranceSec = 300,
): boolean {
	if (!signatureHeader) return false;
	const parts = Object.fromEntries(
		signatureHeader.split(",").map((p) => {
			const [k, v] = p.split("=");
			return [k.trim(), v];
		}),
	);
	const timestamp = parts.t;
	const sig = parts.v1;
	if (!timestamp || !sig) return false;
	const age = Math.abs(Date.now() / 1000 - Number(timestamp));
	if (Number.isNaN(age) || age > toleranceSec) return false;
	const expected = createHmac("sha256", secret)
		.update(`${timestamp}.${rawBody}`)
		.digest("hex");
	try {
		return timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
	} catch {
		return false;
	}
}

export function verifyCreemSignature(
	rawBody: string,
	signatureHeader: string | null,
	secret: string,
): boolean {
	if (!signatureHeader) return false;
	const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
	try {
		return timingSafeEqual(
			Buffer.from(expected),
			Buffer.from(signatureHeader.trim()),
		);
	} catch {
		return false;
	}
}

/** NowPayments IPN: HMAC-SHA512 of sorted JSON body with IPN secret. */
export function verifyNowPaymentsSignature(
	rawBody: string,
	signatureHeader: string | null,
	secret: string,
): boolean {
	if (!signatureHeader) return false;
	let parsed: unknown;
	try {
		parsed = JSON.parse(rawBody);
	} catch {
		return false;
	}
	const sorted = sortKeys(parsed);
	const expected = createHmac("sha512", secret)
		.update(JSON.stringify(sorted))
		.digest("hex");
	try {
		return timingSafeEqual(
			Buffer.from(expected),
			Buffer.from(signatureHeader.trim()),
		);
	} catch {
		return false;
	}
}

function sortKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortKeys);
	if (value && typeof value === "object") {
		const obj = value as Record<string, unknown>;
		const out: Record<string, unknown> = {};
		for (const k of Object.keys(obj).sort()) {
			out[k] = sortKeys(obj[k]);
		}
		return out;
	}
	return value;
}
