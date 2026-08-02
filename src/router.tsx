/**
 * Router + Paraglide URL rewrite (trailing slash preserve, OAuth search integrity).
 */
import {
	createRouter as createTanStackRouter,
	defaultParseSearch,
} from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { getContext } from "./integrations/tanstack-query/root-provider";
import { deLocalizeUrl, localizeUrl } from "./paraglide/runtime";
import { routeTree } from "./routeTree.gen";
import { stringifySearch } from "./utils/search-params";

export function getRouter() {
	const context = getContext();

	const router = createTanStackRouter({
		routeTree,
		context,
		scrollRestoration: true,
		defaultPreload: "intent",
		defaultPreloadStaleTime: 0,
		// Serve both slash forms without 307 so Paraglide trailing-slash
		// urlPatterns and hosts that append `/` stay same-locale.
		trailingSlash: "preserve",
		// Keep multi-value OAuth query keys (Better Auth `ba_param=…&ba_param=…`)
		// as repeated keys. Default JSON-array stringify breaks signature
		// verification on /sign-in and /oauth/consent mid-authorize.
		parseSearch: defaultParseSearch,
		stringifySearch,
		// i18n URL routing: match de-localized paths; Links re-localize.
		// Pairs with paraglideMiddleware in src/server.ts.
		rewrite: {
			input: ({ url }) => deLocalizeUrl(url),
			output: ({ url }) => localizeUrl(url),
		},
	});

	setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient });

	return router;
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
