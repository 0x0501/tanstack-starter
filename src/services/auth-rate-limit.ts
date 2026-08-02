// Which Better Auth endpoints to throttle, and how to key the limiter. Pure and
// framework-free so it's unit-testable without the Cloudflare `env` binding.
//
// Only the brute-force / abuse-prone POST actions are throttled — credential
// stuffing (sign-in), mass signup (sign-up), and email-bombing / enumeration
// (password reset + verification email). Session/callback/get-session POSTs are
// left alone so normal app traffic isn't limited.
export const SENSITIVE_AUTH_PATHS = [
	"/api/auth/sign-in",
	"/api/auth/sign-up",
	"/api/auth/forget-password",
	"/api/auth/reset-password",
	"/api/auth/request-password-reset",
	"/api/auth/send-verification-email",
] as const;

/**
 * The rate-limit key for a request that should be throttled, or null to let it
 * through. Keyed per client IP + path so each action gets its own budget.
 * `cf-connecting-ip` is set by the Cloudflare edge and can't be spoofed/removed
 * by the client; the `x-forwarded-for` fallback only matters off-Cloudflare.
 */
export function authRateLimitKey(request: Request): string | null {
	if (request.method !== "POST") return null;
	const { pathname } = new URL(request.url);
	if (!SENSITIVE_AUTH_PATHS.some((p) => pathname.startsWith(p))) return null;
	const ip =
		request.headers.get("cf-connecting-ip") ??
		request.headers.get("x-forwarded-for") ??
		"unknown";
	return `${ip}:${pathname}`;
}
