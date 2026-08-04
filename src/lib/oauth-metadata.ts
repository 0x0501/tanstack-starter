/**
 * OAuth discovery helpers for the Starter acting as issuer + resource.
 * Pure builders so unit tests do not need Worker env.
 */

export function issuerFromAuthUrl(betterAuthUrl: string): string {
	return `${betterAuthUrl.replace(/\/$/, "")}/api/auth`;
}

export function buildProtectedResourceMetadata(opts: {
	resource: string;
	issuer: string;
}) {
	return {
		resource: opts.resource,
		authorization_servers: [opts.issuer],
		scopes_supported: ["openid", "profile", "email", "offline_access"] as const,
	};
}
