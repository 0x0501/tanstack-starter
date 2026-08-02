import { createMiddleware } from "@tanstack/react-start";
import { withRlsUser } from "@/db/helper";
import { HttpError } from "@/utils/api-error";
import { betterAuthMiddleware } from "./better-auth";

function unauthorized() {
	return new HttpError({
		status: 401,
		error: "unauthorized",
		message: "Authentication required.",
	});
}

/** Require login; leave db as the raw connection (no user RLS transaction). */
export const sessionMiddleware = createMiddleware()
	.middleware([betterAuthMiddleware])
	.server(async ({ next, context, request }) => {
		const session = await context.auth.api.getSession({
			headers: request.headers,
		});

		if (!session?.user) throw unauthorized();

		return next({ context: { session } });
	});

/** Require login and run the handler inside a user-scoped RLS transaction. */
export const protectedMiddleware = createMiddleware()
	.middleware([betterAuthMiddleware])
	.server(async ({ next, context, request }) => {
		const session = await context.auth.api.getSession({
			headers: request.headers,
		});

		if (!session?.user) throw unauthorized();

		return withRlsUser(context.db, session.user.id, (tx) =>
			next({
				context: {
					db: tx,
					session,
				},
			}),
		);
	});
