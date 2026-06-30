import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { createFileRoute } from "@tanstack/react-router";
import { betterAuthMiddleware } from "@/middlewares/better-auth.ts";

export const Route = createFileRoute(
	"/api/auth/.well-known/oauth-authorization-server",
)({
	server: {
		middleware: [betterAuthMiddleware],
		handlers: {
			GET: async ({ request, context }) =>
				oauthProviderAuthServerMetadata(context.auth)(request),
		},
	},
}); 