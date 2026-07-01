import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { createFileRoute } from "@tanstack/react-router";
import { betterAuthMiddleware } from "@/middlewares/better-auth.ts";

// RFC 8414: for an issuer of `${origin}/api/auth`, the authorization server
// metadata lives at `${origin}/.well-known/oauth-authorization-server/api/auth`
// (well-known inserted at the root, issuer path appended) — NOT under /api/auth.
export const Route = createFileRoute(
	"/.well-known/oauth-authorization-server/api/auth",
)({
	server: {
		middleware: [betterAuthMiddleware],
		handlers: {
			GET: async ({ request, context }) =>
				oauthProviderAuthServerMetadata(context.auth)(request),
		},
	},
});
