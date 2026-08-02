// Cloudflare Turnstile is enabled only in production builds that have a public
// site key configured. The Better Auth captcha plugin (server) and the widget
// (client) both read this SAME build-time constant, so they can never disagree:
// no site key ⇒ plugin stays off, so the server never demands a token the
// client can't mint. Vite inlines `import.meta.env.*` into both the worker and
// browser bundles, which is what lets one module gate both sides.
export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as
	| string
	| undefined;

export const CAPTCHA_ENABLED = import.meta.env.PROD && !!TURNSTILE_SITE_KEY;
