import { createFileRoute } from "@tanstack/react-router";
import { createDB } from "@/db";
import { withRlsService } from "@/db/helper";
import { env } from "@/env";
import { verifyStripeSignature } from "@/services/payments-verify";
import { markPurchasePaid } from "@/services/purchase";
import { createPurchasePort } from "@/services/purchase-db";
import { methodNotAllowed } from "@/utils/api-error";
import {
	BodyTooLargeError,
	readTextCapped,
	UnsupportedMediaTypeError,
} from "@/utils/body-limit";

const MAX_BODY = 64 * 1024;

export const Route = createFileRoute("/api/webhooks/stripe")({
	server: {
		handlers: {
			GET: () => methodNotAllowed("POST"),
			POST: async ({ request }) => {
				if (!env.STRIPE_WEBHOOK_SECRET) {
					return new Response("Stripe not configured", { status: 503 });
				}
				let raw: string;
				try {
					raw = await readTextCapped(request, {
						maxBytes: MAX_BODY,
						requireJson: false,
					});
				} catch (e) {
					if (e instanceof BodyTooLargeError) {
						return new Response("Payload too large", { status: 413 });
					}
					if (e instanceof UnsupportedMediaTypeError) {
						return new Response("Unsupported media type", { status: 415 });
					}
					throw e;
				}
				const ok = verifyStripeSignature(
					raw,
					request.headers.get("stripe-signature"),
					env.STRIPE_WEBHOOK_SECRET,
				);
				if (!ok) return new Response("Invalid signature", { status: 400 });

				let event: {
					type?: string;
					data?: { object?: { id?: string; amount_total?: number } };
				};
				try {
					event = JSON.parse(raw) as typeof event;
				} catch {
					return new Response("Invalid JSON", { status: 400 });
				}
				if (
					event.type === "checkout.session.completed" &&
					event.data?.object?.id
				) {
					const { env: cf } = await import("cloudflare:workers");
					const db = createDB(cf.HYPERDRIVE);
					const sessionId = event.data.object.id;
					const amount = event.data.object.amount_total;
					await withRlsService(db, async (tx) => {
						const port = createPurchasePort(tx);
						await markPurchasePaid(port, {
							provider: "stripe",
							externalId: sessionId,
							reportedAmount: amount,
						});
					});
				}
				return new Response(JSON.stringify({ received: true }), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			},
		},
	},
});
