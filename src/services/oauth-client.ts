import { z } from "zod";

export const DEFAULT_OAUTH_SCOPE = "openid profile email offline_access";

const redirectUriSchema = z
	.url()
	.trim()
	.refine(
		(value) => {
			const url = new URL(value);
			if (url.hash || url.username || url.password) return false;
			if (url.protocol === "https:") return true;
			if (url.protocol !== "http:") return false;
			return url.hostname === "127.0.0.1" || url.hostname === "[::1]";
		},
		{
			message:
				"Redirect URI must be HTTPS, or HTTP on 127.0.0.1/[::1], without userinfo or fragments.",
		},
	);

const scopeToken = /^[\x21\x23-\x5B\x5D-\x7E]+$/;
const scopeSchema = z
	.string()
	.trim()
	.min(1)
	.max(500)
	.refine(
		(value) => value.split(/\s+/).every((token) => scopeToken.test(token)),
		{ message: "Scope contains invalid characters." },
	)
	.transform((value) => value.split(/\s+/).join(" "));

export const createOAuthClientInputSchema = z.object({
	clientName: z.string().trim().min(1).max(100),
	redirectUris: z
		.array(redirectUriSchema)
		.min(1)
		.max(10)
		.transform((uris) => [...new Set(uris)]),
	scope: scopeSchema.default(DEFAULT_OAUTH_SCOPE),
	publicClient: z.boolean().default(false),
});

export type CreateOAuthClientInput = z.infer<
	typeof createOAuthClientInputSchema
>;

export function oauthClientRegistrationBody(input: CreateOAuthClientInput) {
	if (input.publicClient) {
		return {
			client_name: input.clientName,
			redirect_uris: input.redirectUris,
			type: "native" as const,
			token_endpoint_auth_method: "none" as const,
			require_pkce: true,
			grant_types: ["authorization_code", "refresh_token"] as const,
			response_types: ["code"] as const,
			skip_consent: false,
			scope: input.scope,
			enable_end_session: true,
		};
	}
	return {
		client_name: input.clientName,
		redirect_uris: input.redirectUris,
		token_endpoint_auth_method: "client_secret_post" as const,
		require_pkce: true,
		grant_types: ["authorization_code", "refresh_token"] as const,
		response_types: ["code"] as const,
		skip_consent: false,
		scope: input.scope,
		enable_end_session: true,
	};
}
