import { createFileRoute } from "@tanstack/react-router";
import { withRlsService } from "@/db/helper";
import { env } from "@/env";
import { webhookBodyLimitMiddleware } from "@/middlewares/body-limit";
import { databaseMiddleware } from "@/middlewares/database";
import { handleCreemWebhook } from "@/services/creem";
import { APIError, methodNotAllowed } from "@/utils/api-error";

// Creem checkout webhook: a thin shell over the framework-agnostic handler.
// Fulfillment runs under service RLS context. HTTP contract: a valid signature
// answers 200 for every mapped outcome so Creem stops retrying a delivered
// event; a bad or missing signature answers 400 with no effect; a genuine
// processing failure throws and answers 5xx so Creem retries — that retry is
// what makes the purchase-paid hook exactly-once.
export const Route = createFileRoute("/api/webhooks/creem")({
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
						const secret = env.CREEM_WEBHOOK_SECRET;
						if (!secret) {
							return APIError({
								status: 503,
								error: "not_configured",
								message: "Creem is not configured.",
							});
						}

						const result = await withRlsService(context.db, (tx) =>
							handleCreemWebhook(tx, {
								rawBody: context.rawBody,
								signature:
									request.headers.get("creem-signature") ??
									request.headers.get("x-creem-signature"),
								secret,
							}),
						);

						if (result === "invalid_signature") {
							return APIError({
								status: 400,
								error: "invalid_signature",
								message: "Signature verification failed.",
							});
						}
						if (result === "invalid_payload") {
							return APIError({
								status: 400,
								error: "invalid_payload",
								message: "Request body is not valid JSON.",
							});
						}
						if (result === "unknown_order") {
							console.error(
								"[creem] event references an unknown purchase — not fulfilled",
							);
						}
						return Response.json({ result }, { status: 200 });
					},
				},
			}),
	},
});
