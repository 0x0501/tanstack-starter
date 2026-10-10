import { webhooks } from "@polar-sh/sdk/2026-10";
import type { Database } from "@/db";
import { markPurchasePaid } from "./purchase";
export async function handlePolarWebhook(db: Database, input: { rawBody: string; headers: Record<string, string>; secret: string }) {
	let event: Awaited<ReturnType<typeof webhooks.validateEvent>>;
	try { event = await webhooks.validateEvent(input.rawBody, input.headers, input.secret); }
	catch (error) { if (error instanceof webhooks.PolarWebhookVerificationError) return "invalid_signature"; if (error instanceof webhooks.PolarWebhookError) return "invalid_payload"; throw error; }
	if (event.type !== "order.paid") return "ignored";
	if (!event.data.checkout_id) return "unknown_order";
	const result = await markPurchasePaid(db, { provider: "polar", externalId: event.data.checkout_id, reportedAmount: event.data.subtotal_amount });
	return result.status === "not_found" ? "unknown_order" : result.status;
}
