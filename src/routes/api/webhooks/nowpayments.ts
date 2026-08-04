import { createFileRoute } from "@tanstack/react-router";
import { createDB } from "@/db";
import { withRlsService } from "@/db/helper";
import { env } from "@/env";
import { verifyNowPaymentsSignature } from "@/services/payments-verify";
import { markPurchasePaid } from "@/services/purchase";
import { createPurchasePort } from "@/services/purchase-db";
import { methodNotAllowed } from "@/utils/api-error";
import {
	BodyTooLargeError,
	readTextCapped,
	UnsupportedMediaTypeError,
} from "@/utils/body-limit";

const MAX_BODY = 64 * 1024;

/** Underpaid invoices must not fulfill as paid. */
const PAID_STATUSES = new Set(["finished", "confirmed"]);

export const Route = createFileRoute("/api/webhooks/nowpayments")({
	server: {
		handlers: {
			GET: () => methodNotAllowed("POST"),
			POST: async ({ request }) => {
				if (!env.NOW_PAYMENTS_IPN_KEY) {
					return new Response("NowPayments not configured", { status: 503 });
				}
				let raw: string;
				try {
					raw = await readTextCapped(request, {
						maxBytes: MAX_BODY,
						requireJson: true,
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
				const ok = verifyNowPaymentsSignature(
					raw,
					request.headers.get("x-nowpayments-sig"),
					env.NOW_PAYMENTS_IPN_KEY,
				);
				if (!ok) return new Response("Invalid signature", { status: 400 });

				let payload: {
					order_id?: string;
					payment_status?: string;
					actually_paid?: number;
					price_amount?: number;
				};
				try {
					payload = JSON.parse(raw) as typeof payload;
				} catch {
					return new Response("Invalid JSON", { status: 400 });
				}

				const orderId = payload.order_id;
				const status = payload.payment_status;
				if (!orderId || !status || !PAID_STATUSES.has(status)) {
					return new Response(JSON.stringify({ ignored: true }), {
						status: 200,
						headers: { "content-type": "application/json" },
					});
				}
				// Underpayment: actually_paid < price_amount → do not fulfill.
				if (
					typeof payload.actually_paid === "number" &&
					typeof payload.price_amount === "number" &&
					payload.actually_paid + 1e-9 < payload.price_amount
				) {
					return new Response(JSON.stringify({ underpaid: true }), {
						status: 200,
						headers: { "content-type": "application/json" },
					});
				}

				const { env: cf } = await import("cloudflare:workers");
				const db = createDB(cf.HYPERDRIVE);
				await withRlsService(db, async (tx) => {
					const port = createPurchasePort(tx);
					await markPurchasePaid(port, {
						provider: "nowpayments",
						externalId: orderId,
					});
				});
				return new Response(JSON.stringify({ received: true }), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			},
		},
	},
});
