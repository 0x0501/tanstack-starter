/** Baseline security headers applied to every Worker response. */
export const BASELINE_SECURITY_HEADERS: Record<string, string> = {
	"X-Content-Type-Options": "nosniff",
	"X-Frame-Options": "DENY",
	"Referrer-Policy": "strict-origin-when-cross-origin",
	"Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

export function withSecurityHeaders(res: Response): Response {
	const headers = new Headers(res.headers);
	for (const [k, v] of Object.entries(BASELINE_SECURITY_HEADERS)) {
		headers.set(k, v);
	}
	// Pass the body through untouched so streaming responses keep streaming.
	return new Response(res.body, {
		status: res.status,
		statusText: res.statusText,
		headers,
	});
}
