import { createFileRoute } from "@tanstack/react-router";
import { authRateLimitMiddleware } from "@/middlewares/auth-rate-limit";
import { betterAuthMiddleware } from "@/middlewares/better-auth";

export const Route = createFileRoute("/api/auth/$")({
	server: {
		// Rate-limit first so brute-force is rejected before any auth/db work.
		middleware: [authRateLimitMiddleware, betterAuthMiddleware],
		handlers: {
			GET: ({ request, context }) => context.auth.handler(request),
			POST: ({ request, context }) => context.auth.handler(request),
		},
	},
});
