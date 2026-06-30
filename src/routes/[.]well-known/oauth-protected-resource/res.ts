import { createFileRoute } from "@tanstack/react-router";
import { serverClient } from "@/lib/server-client.ts";

// WIP
export const Route = createFileRoute(
	"/.well-known/oauth-protected-resource/res",
)({
	server: {
		handlers: {
			GET: async () => {
				const metadata = await serverClient.getProtectedResourceMetadata({
					resource: "",
					authorization_servers: [],
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
