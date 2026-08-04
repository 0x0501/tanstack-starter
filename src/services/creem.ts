/**
 * Creem checkout webhook: signature verification and the framework-agnostic
 * callback handler.
 *
 * Kept free of `env` and framework glue so it is unit-testable; the route
 * (src/routes/api/webhooks/creem.ts) supplies the secret and the
 * service-context db.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Database } from "@/db";
import { markPurchasePaid } from "@/services/purchase";

/**
 * Verify a Creem signature header: HMAC-SHA256 (hex) over the raw body,
 * compared constant-time. Returns false for anything malformed — never throws
 * on bad input, because a throw would answer "retry me" and Creem would replay
 * a hostile body.
 */
export function verifyCreemSignature(
	secret: string,
	rawBody: string,
	signatureHeader: string | null | undefined,
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

export type CreemWebhookResult =
	| "invalid_signature"
	| "invalid_payload"
	| "credited"
	| "unknown_order"
	| "noop";

/**
 * Handle a Creem webhook: verify the signature, then fulfill on the checkout
 * id, joining on it as the Purchase `externalId`. Creem reports no amount we
 * would trust, so fulfillment uses the Purchase row's own amount with no
 * integrity check to run against.
 *
 * `db` must already carry service RLS context (the route wraps this in
 * withRlsService). Throws only on a genuine processing/DB error — including a
 * throw from the purchase-paid hook — so the route can answer 5xx and Creem
 * retries; every mapped outcome resolves so the route answers 200 and Creem
 * stops retrying.
 */
export async function handleCreemWebhook(
	db: Database,
	args: { rawBody: string; signature: string | null; secret: string },
): Promise<CreemWebhookResult> {
	if (!verifyCreemSignature(args.secret, args.rawBody, args.signature)) {
		return "invalid_signature";
	}

	// Creem signs the raw string, so a valid signature over an unparseable body
	// means the sender signed garbage. That is a client error, not a retry.
	let payload: { id?: string; object?: { id?: string }; eventType?: string };
	try {
		payload = JSON.parse(args.rawBody) as typeof payload;
	} catch {
		return "invalid_payload";
	}

	const externalId = payload.object?.id ?? payload.id;
	if (!externalId) return "noop";

	const result = await markPurchasePaid(db, {
		provider: "creem",
		externalId,
	});
	if (result.status === "not_found") return "unknown_order";
	return result.status === "fulfilled" || result.status === "already_paid"
		? "credited"
		: "noop";
}
