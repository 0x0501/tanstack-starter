import { createFileRoute } from "@tanstack/react-router";
import { withRlsService } from "@/db/helper";
import { env } from "@/env";
import { webhookBodyLimitMiddleware } from "@/middlewares/body-limit";
import { databaseMiddleware } from "@/middlewares/database";
import { handlePolarWebhook } from "@/services/polar";
import { methodNotAllowed } from "@/utils/api-error";
export const Route = createFileRoute("/api/webhooks/polar")({
	server: { handlers: ({ createHandlers }) => createHandlers({
		GET: { handler: () => methodNotAllowed("POST") },
		POST: { middleware: [databaseMiddleware, webhookBodyLimitMiddleware], handler: async ({ request, context }) => {
			const secret = env.POLAR_WEBHOOK_SECRET;
			if (!secret) return Response.json({ error: "not_configured" }, { status: 503 });
			const headers = Object.fromEntries(request.headers.entries());
			const result = await withRlsService(context.db, (db) => handlePolarWebhook(db, { rawBody: context.rawBody, headers, secret }));
			return Response.json({ result }, { status: result === "invalid_signature" || result === "invalid_payload" ? 400 : 200 });
		} },
	}) },
});
