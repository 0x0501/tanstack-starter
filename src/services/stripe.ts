/**
 * Stripe Checkout webhook: signature verification and the framework-agnostic
 * callback handler.
 *
 * Kept free of `env` and framework glue so it is unit-testable; the route
 * (src/routes/api/webhooks/stripe.ts) supplies the secret and the
 * service-context db.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Database } from "@/db";
import { markPurchasePaid } from "@/services/purchase";

/** The one event that releases funds. */
const PAID_EVENT = "checkout.session.completed";

/**
 * Verify a `stripe-signature` header: HMAC-SHA256 (hex) over
 * `${timestamp}.${rawBody}`, compared constant-time against the `v1` scheme,
 * with a replay window. Returns false for anything malformed — never throws on
 * bad input, because a throw would answer "retry me" and Stripe would replay a
 * hostile body.
 */
export function verifyStripeSignature(
	secret: string,
	rawBody: string,
	signatureHeader: string | null | undefined,
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

export type StripeWebhookResult =
	| "invalid_signature"
	| "invalid_payload"
	| "credited"
	| "amount_mismatch"
	| "unknown_order"
	| "noop";

/**
 * Handle a Stripe webhook: verify the signature, then fulfill only on
 * `checkout.session.completed`, joining on the Checkout Session id (= Purchase
 * `externalId`). `amount_total` is passed as an integrity check only —
 * fulfillment still trusts the Purchase row's own amount and fails closed on a
 * mismatch. Every other event type leaves the Purchase untouched.
 *
 * `db` must already carry service RLS context (the route wraps this in
 * withRlsService). Throws only on a genuine processing/DB error — including a
 * throw from the purchase-paid hook — so the route can answer 5xx and Stripe
 * retries; every mapped outcome resolves so the route answers 200 and Stripe
 * stops retrying.
 */
export async function handleStripeWebhook(
	db: Database,
	args: { rawBody: string; signature: string | null; secret: string },
): Promise<StripeWebhookResult> {
	if (!verifyStripeSignature(args.secret, args.rawBody, args.signature)) {
		return "invalid_signature";
	}

	// Stripe signs the raw string, so a valid signature over an unparseable body
	// means the sender signed garbage. That is a client error, not a retry.
	let event: {
		type?: string;
		data?: { object?: { id?: string; amount_total?: number } };
	};
	try {
		event = JSON.parse(args.rawBody) as typeof event;
	} catch {
		return "invalid_payload";
	}

	if (event.type !== PAID_EVENT) return "noop";
	const externalId = event.data?.object?.id;
	if (!externalId) return "noop";

	const result = await markPurchasePaid(db, {
		provider: "stripe",
		externalId,
		reportedAmount: event.data?.object?.amount_total,
	});
	if (result.status === "not_found") return "unknown_order";
	if (result.status === "amount_mismatch") return "amount_mismatch";
	return result.status === "fulfilled" || result.status === "already_paid"
		? "credited"
		: "noop";
}
