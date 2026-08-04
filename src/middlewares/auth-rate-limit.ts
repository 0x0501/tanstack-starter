import { env } from "cloudflare:workers";
import { createMiddleware } from "@tanstack/react-start";
import { authRateLimitKey } from "@/services/auth-rate-limit";

// Brute-force / abuse throttle for the sensitive Better Auth endpoints. Better
// Auth's own limiter is an in-memory Map — per Worker isolate on Cloudflare, so
// it never aggregates into a global limit. This uses the Workers Rate Limiting
// binding (AUTH_RATE_LIMITER), which is shared across isolates in a location and
// strongly consistent. Only enforced when deployed; a no-op locally / if the
// binding is absent (env.AUTH_RATE_LIMITER undefined). `env` is referenced only
// inside .server() so it's stripped from the client bundle.
export const authRateLimitMiddleware = createMiddleware().server(
	async ({ next, request }) => {
		const limiter = (
			env as {
				AUTH_RATE_LIMITER?: {
					limit: (o: { key: string }) => Promise<{ success: boolean }>;
				};
			}
		).AUTH_RATE_LIMITER;
		const key = limiter ? authRateLimitKey(request) : null;
		if (limiter && key) {
			const { success } = await limiter.limit({ key });
			if (!success) {
				return Response.json(
					{
						status: 429,
						error: "rate_limited",
						message: "Too many requests. Please try again shortly.",
					},
					{ status: 429, headers: { "Retry-After": "60" } },
				);
			}
		}
		return next();
	},
);
