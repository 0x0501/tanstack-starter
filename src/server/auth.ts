import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { betterAuthMiddleware } from "@/middlewares/better-auth";

export type RootSession = {
	user: {
		id: string;
		email: string;
		name: string;
		emailVerified: boolean;
		role: string | null;
		twoFactorEnabled: boolean;
		locale: string | null;
	};
};

/**
 * One session read per request for the root route.
 * Child routes should prefer `context.session` when a full session is enough;
 * privileged surfaces may still re-read with cookie-cache disabled.
 */
export const getSession = createServerFn({ method: "GET" })
	.middleware([betterAuthMiddleware])
	.handler(async ({ context }): Promise<RootSession | null> => {
		const headers = getRequestHeaders();
		const session = await context.auth.api.getSession({ headers });
		if (!session?.user) return null;
		const u = session.user as typeof session.user & {
			role?: string | null;
			twoFactorEnabled?: boolean | null;
			locale?: string | null;
		};
		return {
			user: {
				id: session.user.id,
				email: session.user.email,
				name: session.user.name,
				emailVerified: Boolean(session.user.emailVerified),
				role: u.role ?? null,
				twoFactorEnabled: Boolean(u.twoFactorEnabled),
				locale: u.locale ?? null,
			},
		};
	});
