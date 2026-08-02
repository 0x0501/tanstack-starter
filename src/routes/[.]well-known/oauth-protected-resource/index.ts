import { createFileRoute } from "@tanstack/react-router";
import { env } from "@/env";
import {
	buildProtectedResourceMetadata,
	issuerFromAuthUrl,
} from "@/lib/oauth-metadata";

// RFC 9728 Protected Resource Metadata. Advertises this app as a resource
// server and points clients at its authorization server (this same app's
// better-auth mount). Served at /.well-known/oauth-protected-resource.
//
// Does not import the auth factory — keeps this machine route free of
// cloudflare:workers / betterAuth graph.
export const Route = createFileRoute("/.well-known/oauth-protected-resource/")({
	server: {
		handlers: {
			GET: async () => {
				const metadata = buildProtectedResourceMetadata({
					resource: env.APP_ORIGIN,
					issuer: issuerFromAuthUrl(env.BETTER_AUTH_URL),
				});
				return new Response(JSON.stringify(metadata), {
					headers: {
						"Content-Type": "application/json",
						"Cache-Control":
							"public, max-age=15, stale-while-revalidate=15, stale-if-error=86400",
					},
				});
			},
		},
	},
});
