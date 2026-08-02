import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";
import { adminMiddleware } from "@/middlewares/admin";
import { logAdminAction } from "@/services/admin-security";
import {
	createOAuthClientInputSchema,
	oauthClientRegistrationBody,
} from "@/services/oauth-client";
import { deleteOAuthClientById } from "@/services/oauth-clients";

type OAuthClientSummary = {
	clientId: string;
	name: string | null;
	redirectUris: string[];
	grantTypes: string[];
	responseTypes: string[];
	tokenEndpointAuthMethod: string | null;
	scope: string | null;
};

const stringArray = (value: unknown) =>
	Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];

export const getOAuthClients = createServerFn({ method: "GET" })
	.middleware([adminMiddleware])
	.handler(async ({ context }) => {
		const clients = await context.auth.api.getOAuthClients({
			headers: getRequestHeaders(),
		});

		return (clients ?? []).map(
			(client): OAuthClientSummary => ({
				clientId: client.client_id,
				name: client.client_name ?? null,
				redirectUris: stringArray(client.redirect_uris),
				grantTypes: stringArray(client.grant_types),
				responseTypes: stringArray(client.response_types),
				tokenEndpointAuthMethod: client.token_endpoint_auth_method ?? null,
				scope: client.scope ?? null,
			}),
		);
	});

export const createOAuthClient = createServerFn({ method: "POST" })
	.middleware([adminMiddleware])
	.validator(createOAuthClientInputSchema)
	.handler(async ({ context, data }) => {
		const client = await context.auth.api.adminCreateOAuthClient({
			body: oauthClientRegistrationBody(data),
			headers: getRequestHeaders(),
		});
		await logAdminAction(context.db, {
			actorId: context.session.user.id,
			action: "oauth_client.create",
			targetType: "oauth_client",
			targetId: client.client_id,
			detail: { name: client.client_name ?? null },
		});
		return {
			clientId: client.client_id,
			clientSecret: client.client_secret ?? null,
			name: client.client_name ?? null,
			redirectUris: client.redirect_uris ?? [],
		};
	});

export const deleteOAuthClient = createServerFn({ method: "POST" })
	.middleware([adminMiddleware])
	.validator(z.object({ clientId: z.string().trim().min(1) }))
	.handler(async ({ context, data }) => {
		const deleted = await deleteOAuthClientById(context.db, data.clientId);
		if (deleted) {
			await logAdminAction(context.db, {
				actorId: context.session.user.id,
				action: "oauth_client.delete",
				targetType: "oauth_client",
				targetId: data.clientId,
			});
		}
		return { ok: deleted };
	});
