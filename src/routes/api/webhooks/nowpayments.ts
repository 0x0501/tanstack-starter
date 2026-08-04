import { createFileRoute } from "@tanstack/react-router";
import { withRlsService } from "@/db/helper";
import { env } from "@/env";
import { webhookBodyLimitMiddleware } from "@/middlewares/body-limit";
import { databaseMiddleware } from "@/middlewares/database";
import { handleNowPaymentsWebhook } from "@/services/nowpayments";
import { APIError, methodNotAllowed } from "@/utils/api-error";

// NowPayments IPN callback: a thin shell over the framework-agnostic handler.
// Fulfillment runs under service RLS context. HTTP contract: a valid signature
// answers 200 for every mapped outcome so NowPayments stops retrying a
// delivered notification; a bad or missing signature answers 400 with no
// effect; a genuine processing failure throws and answers 5xx so NowPayments
// retries — that retry is what makes the purchase-paid hook exactly-once.
export const Route = createFileRoute("/api/webhooks/nowpayments")({
	server: {
		handlers: ({ createHandlers }) =>
			createHandlers({
				// Answers a browser, which would otherwise get the SPA shell.
				GET: { handler: () => methodNotAllowed("POST") },
				POST: {
					// Public and unauthenticated: the body is capped before anything
					// reads or hashes it.
					middleware: [databaseMiddleware, webhookBodyLimitMiddleware],
					handler: async ({ request, context }) => {
						const ipnKey = env.NOW_PAYMENTS_IPN_KEY;
						if (!ipnKey) {
							return APIError({
								status: 503,
								error: "not_configured",
								message: "NowPayments is not configured.",
							});
						}

						const result = await withRlsService(context.db, (tx) =>
							handleNowPaymentsWebhook(tx, {
								rawBody: context.rawBody,
								signature: request.headers.get("x-nowpayments-sig"),
								ipnKey,
							}),
						);

						if (result === "invalid_signature") {
							return APIError({
								status: 400,
								error: "invalid_signature",
								message: "Signature verification failed.",
							});
						}
						if (result === "unknown_order") {
							// Signed, but joins no known Purchase — nothing to do. Still 200
							// so NowPayments stops retrying a callback we cannot act on.
							console.error(
								"[nowpayments] IPN references an unknown purchase — not fulfilled",
							);
						}
						return Response.json({ result }, { status: 200 });
					},
				},
			}),
	},
});
