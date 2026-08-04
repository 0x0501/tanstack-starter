/**
 * NowPayments crypto IPN: signature verification and the framework-agnostic
 * callback handler. Crypto settles asynchronously, so the signed IPN is the
 * sole source of truth for fulfillment — the return page never confirms.
 *
 * Kept free of `env` and framework glue so it is unit-testable; the route
 * (src/routes/api/webhooks/nowpayments.ts) supplies the secret and the
 * service-context db.
 */
import type { Database } from "@/db";
import { markPurchasePaid } from "@/services/purchase";

/** Only these statuses release funds; everything else leaves the row pending. */
const PAID_STATUSES = new Set(["finished", "confirmed"]);

/**
 * Deeper than any real IPN payload, shallow enough that the recursion below
 * cannot exhaust the stack on a hostile body.
 */
const MAX_CANONICAL_DEPTH = 64;

class TooDeepError extends Error {}

/** Recursively sort object keys so serialization is canonical (arrays keep order). */
function sortKeys(value: unknown, depth = 0): unknown {
	if (depth > MAX_CANONICAL_DEPTH) throw new TooDeepError();
	if (Array.isArray(value)) return value.map((v) => sortKeys(v, depth + 1));
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.keys(value as Record<string, unknown>)
				.sort()
				.map((k) => [
					k,
					sortKeys((value as Record<string, unknown>)[k], depth + 1),
				]),
		);
	}
	return value;
}

async function hmacSha512Hex(key: string, message: string): Promise<string> {
	const enc = new TextEncoder();
	const cryptoKey = await crypto.subtle.importKey(
		"raw",
		enc.encode(key),
		{ name: "HMAC", hash: "SHA-512" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
	return Array.from(new Uint8Array(sig))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/** Length-independent, constant-time comparison of two equal-length hex strings. */
function timingSafeEqualHex(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

/**
 * Verify an IPN callback: HMAC-SHA512 (hex) over the recursively key-sorted,
 * re-serialized JSON body, compared constant-time against the
 * `x-nowpayments-sig` header. Returns false for a missing/invalid signature or
 * an unparseable body — never throws on bad input.
 */
export async function verifyNowPaymentsSignature(
	ipnKey: string,
	rawBody: string,
	signature: string | null | undefined,
): Promise<boolean> {
	if (!signature) return false;
	let canonical: string;
	try {
		// Parsing and canonicalising are both refusals, not crashes: a body that
		// is unparseable or nested past the depth limit is a bad signature. If it
		// escaped as a 500 the route would answer "retry me" and NowPayments
		// would replay the hostile body forever.
		canonical = JSON.stringify(sortKeys(JSON.parse(rawBody)));
	} catch {
		return false;
	}
	const expected = await hmacSha512Hex(ipnKey, canonical);
	return timingSafeEqualHex(expected, signature.trim());
}

export type NowPaymentsWebhookResult =
	| "invalid_signature"
	| "credited"
	| "underpaid"
	| "unknown_order"
	| "noop";

/**
 * Handle a NowPayments IPN: verify the signature, then map the payment status
 * to the matching action, joining on our own `order_id` (= Purchase
 * `externalId`). Only a terminal paid status fulfills; an underpaid invoice and
 * every intermediate status leave the Purchase `pending`. Fulfillment is
 * idempotent and status-guarded (see services/purchase), so retries and
 * out-of-order callbacks never deliver twice.
 *
 * `db` must already carry service RLS context (the route wraps this in
 * withRlsService). Throws only on a genuine processing/DB error — including a
 * throw from the purchase-paid hook — so the route can answer 5xx and
 * NowPayments retries; every mapped outcome resolves so the route answers 200
 * and NowPayments stops retrying.
 */
export async function handleNowPaymentsWebhook(
	db: Database,
	args: { rawBody: string; signature: string | null; ipnKey: string },
): Promise<NowPaymentsWebhookResult> {
	if (
		!(await verifyNowPaymentsSignature(
			args.ipnKey,
			args.rawBody,
			args.signature,
		))
	) {
		return "invalid_signature";
	}

	// Parsing cannot fail here: verification already parsed this exact body.
	const body = JSON.parse(args.rawBody) as {
		order_id?: string;
		payment_status?: string;
		actually_paid?: number;
		price_amount?: number;
	};

	const externalId = body.order_id;
	if (!externalId || !body.payment_status) return "noop";
	if (!PAID_STATUSES.has(body.payment_status)) return "noop";

	// Underpayment: actually_paid < price_amount → do not fulfill.
	if (
		typeof body.actually_paid === "number" &&
		typeof body.price_amount === "number" &&
		body.actually_paid + 1e-9 < body.price_amount
	) {
		return "underpaid";
	}

	const result = await markPurchasePaid(db, {
		provider: "nowpayments",
		externalId,
	});
	if (result.status === "not_found") return "unknown_order";
	return result.status === "fulfilled" || result.status === "already_paid"
		? "credited"
		: "noop";
}
