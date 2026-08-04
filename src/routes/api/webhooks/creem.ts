import { createFileRoute } from "@tanstack/react-router";
import { createDB } from "@/db";
import { withRlsService } from "@/db/helper";
import { env } from "@/env";
import { verifyCreemSignature } from "@/services/payments-verify";
import { markPurchasePaid } from "@/services/purchase";
import { createPurchasePort } from "@/services/purchase-db";
import { methodNotAllowed } from "@/utils/api-error";
import {
	BodyTooLargeError,
	readTextCapped,
	UnsupportedMediaTypeError,
} from "@/utils/body-limit";

const MAX_BODY = 64 * 1024;

export const Route = createFileRoute("/api/webhooks/creem")({
	server: {
		handlers: {
			GET: () => methodNotAllowed("POST"),
			POST: async ({ request }) => {
				if (!env.CREEM_WEBHOOK_SECRET) {
					return new Response("Creem not configured", { status: 503 });
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
				const ok = verifyCreemSignature(
					raw,
					request.headers.get("creem-signature") ??
						request.headers.get("x-creem-signature"),
					env.CREEM_WEBHOOK_SECRET,
				);
				if (!ok) return new Response("Invalid signature", { status: 400 });

				let payload: {
					id?: string;
					object?: { id?: string };
					eventType?: string;
				};
				try {
					payload = JSON.parse(raw) as typeof payload;
				} catch {
					return new Response("Invalid JSON", { status: 400 });
				}
				const checkoutId = payload.object?.id ?? payload.id;
				if (checkoutId) {
					const { env: cf } = await import("cloudflare:workers");
					const db = createDB(cf.HYPERDRIVE);
					await withRlsService(db, async (tx) => {
						const port = createPurchasePort(tx);
						await markPurchasePaid(port, {
							provider: "creem",
							externalId: checkoutId,
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
