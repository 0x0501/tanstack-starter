import { createFileRoute } from "@tanstack/react-router";

// RFC 9728 Protected Resource Metadata. Advertises this app as a resource
// server and points clients at its authorization server (this same app's
// better-auth mount). Must be served at exactly /.well-known/oauth-protected-resource.
export const Route = createFileRoute("/.well-known/oauth-protected-resource")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const origin = new URL(request.url).origin;
				const metadata = {
					resource: origin,
					authorization_servers: [`${origin}/api/auth`],
				};
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
