import { createFileRoute } from "@tanstack/react-router";
import { betterAuthMiddleware } from "@/middlewares/better-auth";

export const Route = createFileRoute("/api/auth/$")({
	server: {
		middleware: [betterAuthMiddleware],
		handlers: {
			GET: ({ request, context }) => context.auth.handler(request),
			POST: ({ request, context }) => context.auth.handler(request),
		},
	},
});
