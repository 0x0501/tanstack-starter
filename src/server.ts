/**
 * Worker / SSR entry — Paraglide ambient locale + original Request handoff.
 *
 * Pass the ORIGINAL localized request into Start. Router `rewrite` does
 * de-/re-localization; handing it an already-de-localized URL causes a 307 loop.
 * paraglideMiddleware still sets ambient getLocale() for SSR messages.
 */
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { withSecurityHeaders } from "@/lib/security-headers";
import { paraglideMiddleware } from "./paraglide/server.js";

export default createServerEntry({
	fetch: async (request) => {
		return paraglideMiddleware(request, async () => {
			// Original request — not the middleware-delocalized one.
			const res = await handler.fetch(request);
			return withSecurityHeaders(res);
		});
	},
});
