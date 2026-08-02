import { createRootRouteWithContext } from "@tanstack/react-router";
import { NotFound } from "#/components/root/not-found.tsx";
import { RootDocument } from "#/components/root/root-document.tsx";
import { RootError } from "#/components/root/root-error.tsx";
import type { MyRouterContext } from "#/integrations/tanstack-query/root-provider.tsx";
import {
	abs,
	DEFAULT_DESCRIPTION,
	DEFAULT_TITLE,
	SITE_NAME,
	SITE_ORIGIN,
	THEME_COLOR_DARK,
	THEME_COLOR_LIGHT,
} from "#/lib/site.ts";
import { THEME_INIT_SCRIPT } from "#/lib/theme.ts";
import { getLocale } from "@/paraglide/runtime";
import { getSession } from "@/server/auth";
import appCss from "../styles.css?url";

const OG_IMAGE = abs("/logo512.png");

export const Route = createRootRouteWithContext<MyRouterContext>()({
	// One session read per request, inherited by every match. Child routes may
	// read `context.session` rather than call getSession again. Privileged
	// mutations that must not trust the cookie cache still re-read the DB.
	beforeLoad: async () => ({ session: await getSession() }),
	head: () => {
		const locale = getLocale();
		return {
			meta: [
				{ charSet: "utf-8" },
				{
					name: "viewport",
					content: "width=device-width, initial-scale=1, viewport-fit=cover",
				},
				// Sensible defaults; content pages (e.g. `/`) may override title/description.
				{ title: DEFAULT_TITLE },
				{ name: "description", content: DEFAULT_DESCRIPTION },
				{ name: "application-name", content: SITE_NAME },
				{ name: "apple-mobile-web-app-title", content: SITE_NAME },
				// Standard tag for Chrome; iOS Safari still reads only the apple- one.
				{ name: "mobile-web-app-capable", content: "yes" },
				{ name: "apple-mobile-web-app-capable", content: "yes" },
				{
					name: "apple-mobile-web-app-status-bar-style",
					content: "black-translucent",
				},
				{ name: "format-detection", content: "telephone=no" },
				// Public pages are indexable by default; gated/transactional routes set
				// their own `noindex` (dashboard, reset-password, two-factor, …).
				{ name: "robots", content: "index, follow" },
				// Browser UI tint per theme.
				{
					name: "theme-color",
					content: THEME_COLOR_LIGHT,
					media: "(prefers-color-scheme: light)",
				},
				{
					name: "theme-color",
					content: THEME_COLOR_DARK,
					media: "(prefers-color-scheme: dark)",
				},
				// Open Graph
				{ property: "og:type", content: "website" },
				{ property: "og:site_name", content: SITE_NAME },
				{ property: "og:title", content: DEFAULT_TITLE },
				{ property: "og:description", content: DEFAULT_DESCRIPTION },
				{ property: "og:image", content: OG_IMAGE },
				{ property: "og:locale", content: locale === "de" ? "de_DE" : "en_US" },
				// Twitter
				{ name: "twitter:card", content: "summary_large_image" },
				{ name: "twitter:title", content: DEFAULT_TITLE },
				{ name: "twitter:description", content: DEFAULT_DESCRIPTION },
				{ name: "twitter:image", content: OG_IMAGE },
			],
			links: [
				{ rel: "stylesheet", href: appCss },
				// Icons — last equally-appropriate entry wins in modern browsers.
				{
					rel: "icon",
					type: "image/x-icon",
					href: "/favicon.ico",
				},
				{
					rel: "shortcut icon",
					type: "image/x-icon",
					href: "/favicon.ico",
				},
				{
					rel: "icon",
					type: "image/png",
					sizes: "192x192",
					href: "/logo192.png",
				},
				{
					rel: "icon",
					type: "image/png",
					sizes: "512x512",
					href: "/logo512.png",
				},
				{
					rel: "apple-touch-icon",
					href: "/logo192.png",
					sizes: "192x192",
				},
				{ rel: "manifest", href: "/manifest.json" },
			],
			scripts: [
				{
					// Set the theme class before first paint: stored choice wins,
					// system preference otherwise. See src/lib/theme.ts.
					children: THEME_INIT_SCRIPT,
				},
				// Structured data — only with an absolute origin (schema.org needs absolute URLs).
				...(SITE_ORIGIN
					? [
							{
								type: "application/ld+json",
								children: JSON.stringify({
									"@context": "https://schema.org",
									"@graph": [
										{
											"@type": "Organization",
											"@id": `${SITE_ORIGIN}/#organization`,
											name: SITE_NAME,
											url: SITE_ORIGIN,
											logo: abs("/logo512.png"),
										},
										{
											"@type": "WebSite",
											"@id": `${SITE_ORIGIN}/#website`,
											name: SITE_NAME,
											url: SITE_ORIGIN,
											description: DEFAULT_DESCRIPTION,
											inLanguage: locale,
											publisher: { "@id": `${SITE_ORIGIN}/#organization` },
										},
										{
											"@type": "SoftwareApplication",
											"@id": `${SITE_ORIGIN}/#app`,
											name: SITE_NAME,
											url: SITE_ORIGIN,
											description: DEFAULT_DESCRIPTION,
											inLanguage: locale,
											applicationCategory: "DeveloperApplication",
											operatingSystem: "Web",
											publisher: { "@id": `${SITE_ORIGIN}/#organization` },
										},
									],
								}),
							},
						]
					: []),
			],
		};
	},
	errorComponent: ({ error, reset }) => (
		<RootError error={error} reset={reset} />
	),
	notFoundComponent: NotFound,
	shellComponent: RootDocument,
});
